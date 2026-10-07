import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase admin/server client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const { messages, machineId } = await req.json();

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("API Key is missing from environment variables.");
    }

    // 1. Fetch indexed documents from your "machine-documents" table
    let machineContext = '';

    if (machineId && machineId !== 'unknown') {
      const { data: docs, error: docError } = await supabase
        .from('machine-documents') // Updated table name
        .select('file_name, storage_path, content')
        .eq('machine_id', machineId); // Verified column name

      if (!docError && docs && docs.length > 0) {
        const contextParts = [];

        for (const doc of docs) {
          // If the file text was saved directly to the database row
          if (doc.content) {
            contextParts.push(`--- FILE: ${doc.file_name} ---\n${doc.content}`);
          } 
          // If the file was saved to Supabase Storage
          else if (doc.storage_path) {
            const { data: fileBlob } = await supabase.storage
              .from('machine-docs') // Updated bucket name
              .download(doc.storage_path);

            if (fileBlob) {
              const textContent = await fileBlob.text();
              contextParts.push(`--- FILE: ${doc.file_name} ---\n${textContent}`);
            }
          }
        }

        machineContext = contextParts.join('\n\n');
      }
    }

    // 2. Build the system prompt
    const systemPrompt = `You are FaultMind, an expert industrial automation and diagnostic engineer.
You are troubleshooting machine ID: "${machineId}".

${machineContext ? `Use the following technical documentation and PLC logic to answer questions accurately. Reference exact network numbers, tag names, timers, and setpoints from these files:\n\n${machineContext}` : 'No machine documentation has been indexed for this machine yet. Advise the user accordingly.'}

Provide clear, structured, and actionable troubleshooting steps based strictly on the provided logic.`;

    // 3. Stream response with Gemini 3.8 Flash
    const result = await streamText({
      model: google('gemini-3.8-flash'),
      system: systemPrompt,
      messages: messages,
    });

    return result.toTextStreamResponse();

  } catch (error) {
    console.error("🚨 BACKEND CRASH:", error);
    return new Response(error.message || error.toString(), { status: 500 });
  }
}