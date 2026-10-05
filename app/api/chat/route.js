import { streamText, embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const maxDuration = 30;

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return new Response('Unauthorized: Please log in to use FaultMind AI.', { status: 401 });
    }

    const { machineId, messages } = await req.json();
    const lastUserMessage = messages?.[messages.length - 1];

    // 1. Save user prompt to Supabase
    if (lastUserMessage && lastUserMessage.role === 'user' && machineId) {
      await supabase.from('machine_chats').insert({
        machine_id: machineId,
        user_id: user.id,
        role: 'user',
        content: lastUserMessage.content,
      });
    }

    // 2. Query matching technical documentation via vector similarity
    let manualContext = '';
    if (lastUserMessage && machineId) {
      try {
        const { embedding } = await embed({
          model: openai.embedding('text-embedding-3-small'),
          value: lastUserMessage.content,
        });

        const { data: matchedDocs, error: matchError } = await supabase.rpc(
          'match_machine_documents',
          {
            query_embedding: embedding,
            match_threshold: 0.25,
            match_count: 4,
            p_machine_id: machineId,
          }
        );

        if (!matchError && matchedDocs?.length > 0) {
          manualContext = matchedDocs
            .map((doc) => `--- SOURCE MANUAL: ${doc.file_name} ---\n${doc.content}`)
            .join('\n\n');
        }
      } catch (err) {
        console.error('Document embedding lookup error:', err);
      }
    }

    // 3. Assemble dynamic system prompt with grounded manual context
    const systemPrompt = `You are FaultMind, an expert AI diagnostic assistant for industrial control, automation, and maintenance engineers. 
Your goal is to help maintenance engineers eliminate downtime and find the root cause of machine faults rapidly. 
Provide highly technical, precise troubleshooting steps for industrial machinery, Variable Frequency Drives (VFDs), SCADA systems, and PLCs (including Siemens TIA Portal, WinCC, and Delta).
Format your responses with clear, actionable bullet points. Avoid generic consumer IT advice.

${
  manualContext
    ? `Use the following technical documentation excerpts specifically indexed for this machine to answer the engineer's prompt directly whenever applicable. Reference the source file name if relevant:\n\n${manualContext}`
    : ''
}`;

    // 4. Stream response and save assistant message on completion
    const result = await streamText({
      model: openai('gpt-4o'),
      system: systemPrompt,
      messages,
      onFinish: async ({ text }) => {
        if (machineId) {
          await supabase.from('machine_chats').insert({
            machine_id: machineId,
            user_id: user.id,
            role: 'assistant',
            content: text,
          });
        }
      },
    });

    return new Response(result.textStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.error('FaultMind Chat API Error:', error);
    return new Response(`Server Crash Details: ${error.message}`, { status: 500 });
  }
}