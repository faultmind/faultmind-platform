import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const maxDuration = 60;

export async function POST(req) {
  try {
    const { messages, machineId, sessionId } = await req.json();

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("API Key is missing.");
    }

    // 1. Authenticate the user securely using cookies
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return cookieStore.getAll(); } } }
    );
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (!user || authError) return new Response('Unauthorized', { status: 401 });

    // 2. Setup Admin client for secure database background inserts
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // THE FIX: Prevent passing the string 'unknown' to a UUID database column
    const validMachineId = (machineId && machineId !== 'unknown') ? machineId : null;

    // 3. Save the newest User message to the database immediately
    const latestUserMessage = messages[messages.length - 1];
    if (latestUserMessage && latestUserMessage.role === 'user') {
      const { error: userInsertError } = await adminClient.from('chat_messages').insert([{
        machine_id: validMachineId,
        user_id: user.id,
        session_id: sessionId,
        role: 'user',
        content: latestUserMessage.content
      }]);
      
      if (userInsertError) {
        throw new Error(`DB Rejection: ${userInsertError.message} | ${userInsertError.hint || ''}`);
      };
    }

    // 4. Retrieve Document Context
    let machineContext = '';
    if (validMachineId) {
      const { data: docs, error: docError } = await adminClient
        .from('machine_documents')
        .select('file_name, storage_path')
        .eq('machine_id', validMachineId);

      if (docError) console.error("🚨 SUPABASE ERROR:", docError);

      if (docs && docs.length > 0) {
        const parts = [];
        for (const doc of docs) {
          if (doc.storage_path) {
            const { data: fileBlob, error: storageErr } = await adminClient.storage
              .from('machine-docs')
              .download(doc.storage_path);

            if (storageErr) console.error(`🚨 DOWNLOAD ERROR FOR ${doc.file_name}:`, storageErr);
            if (fileBlob) parts.push(`--- FILE: ${doc.file_name} ---\n${await fileBlob.text()}`);
          }
        }
        machineContext = parts.join('\n\n');
      }
    }

    const systemPrompt = `You are FaultMind, an industrial automation troubleshooting expert.
Machine ID: ${validMachineId}

${machineContext 
  ? `CRITICAL INSTRUCTION: Analyze the exact PLC logic and tags below to answer:
---
${machineContext}
---
RULES:
1. Be direct, concise, and technical.
2. Identify the exact network, tags, and timer presets involved.
3. List 2 to 4 physical checks (sensors, contacts, mechanical) without disclaimers or theoretical introductions.` 
  : 'ERROR: Machine documentation is not indexed for this machine. State this clearly in one sentence and do not guess.'}`;

    // 5. Stream response to UI, then save it to the DB when finished
    const result = await streamText({
      model: google('gemini-3.8-flash'),
      system: systemPrompt,
      messages: messages,
      onFinish: async ({ text }) => {
        const { error: botInsertError } = await adminClient.from('chat_messages').insert([{
          machine_id: validMachineId,
          user_id: user.id,
          session_id: sessionId,
          role: 'assistant',
          content: text
        }]);
        
        if (botInsertError) console.error("🚨 DB ERROR (Bot Msg):", botInsertError);
      }
    });

    return result.toTextStreamResponse();

  } catch (error) {
    console.error("🚨 BACKEND CRASH:", error);
    return new Response(error.message || error.toString(), { status: 500 });
  }
}