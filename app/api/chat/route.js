import { streamText, embed, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';

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
          // Swapped to Google's embedding model to match our new database dimensions
          model: google.textEmbeddingModel('text-embedding-004'),
          value: lastUserMessage.content,
        });

        const { data: matchedDocs, error: matchError } = await supabase.rpc(
          'match_machine_documents',
          {
            query_embedding: embedding,
            match_threshold: 0.0,
            match_count: 25,
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

    // 3. Assemble dynamic system prompt with grounded manual context and Reporting Rules
    const systemPrompt = `You are FaultMind, an expert AI diagnostic assistant for industrial control, automation, and maintenance engineers. 
Your goal is to help maintenance engineers eliminate downtime and find the root cause of machine faults rapidly. 
Provide highly technical, precise troubleshooting steps for industrial machinery, Variable Frequency Drives (VFDs), SCADA systems, and PLCs (including Siemens TIA Portal, WinCC, and Delta).
Format your responses with clear, actionable bullet points. Avoid generic consumer IT advice.

REPORTING MODE RULES:
If the user is providing a maintenance shift log or fault report, extract the details into the 'updateReportForm' tool.
If required fields (machine, root_cause, parts_replaced, downtime_minutes, technicians) are missing, ask the user a short, direct question to gather them.
Cross-reference any mentioned parts with standard industrial formats.

${
  manualContext
    ? `Use the following technical documentation excerpts specifically indexed for this machine to answer the engineer's prompt directly whenever applicable. Reference the source file name if relevant:\n\n${manualContext}`
    : ''
}`;

    // 4. Stream response (without awaiting) and enable Tool Calling
    const result = streamText({
      model: google('gemini-1.5-flash'),
      system: systemPrompt,
      messages,
      tools: {
        updateReportForm: tool({
          description: 'Extracts maintenance report data to silently update the live UI form in the background.',
          parameters: z.object({
            machine_id: z.string().optional().describe('The specific machine, equipment, or line name'),
            root_cause: z.string().optional().describe('Brief technical description of the failure and how it was resolved'),
            parts_replaced: z.array(z.string()).optional().describe('Specific part numbers or component names swapped (e.g., Siemens 3RT contactor, VFD)'),
            downtime_minutes: z.number().optional().describe('Estimated duration of the machine downtime in minutes'),
            technicians: z.array(z.string()).optional().describe('Names of the engineering staff involved in the fix'),
          }),
          execute: async (extractedData) => {
            // Echoes the JSON back to the frontend immediately for the bottom sheet
            return {
              success: true,
              timestamp: new Date().toISOString(),
              data: extractedData
            };
          },
        }),
      },
      onFinish: async ({ text }) => {
        // Only save the message if there is conversational text.
        // (Tool calls without text don't need to be saved in the chat log)
        if (machineId && text) {
          await supabase.from('machine_chats').insert({
            machine_id: machineId,
            user_id: user.id,
            role: 'assistant',
            content: text,
          });
        }
      },
    });

    // 5. Send data stream (includes text and tool calls)
    return result.toAIStreamResponse();
  } catch (error) {
    console.error('FaultMind Chat API Error:', error);
    return new Response(`Server Crash Details: ${error.message}`, { status: 500 });
  }
}