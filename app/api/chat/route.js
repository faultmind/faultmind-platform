import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { createClient } from '@supabase/supabase-js';

// Allow extended execution time for large file downloads 
export const maxDuration = 60;

// Use the Service Role Key on the server to bypass RLS restrictions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const { messages, machineId } = await req.json();

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("API Key is missing.");
    }

    let machineContext = '';

    if (machineId && machineId !== 'unknown') {
      const { data: docs, error: docError } = await supabase
        .from('machine_documents')
        .select('file_name, storage_path') // Query only the necessary columns
        .eq('machine_id', machineId);

      console.log("🔍 SUPABASE DOCS FOUND:", docs);
      if (docError) console.error("🚨 SUPABASE ERROR:", docError);

      if (docs && docs.length > 0) {
        const parts = [];
        for (const doc of docs) {
          // Rely exclusively on the storage bucket now that the content column is dropped
          if (doc.storage_path) {
            const { data: fileBlob, error: storageErr } = await supabase.storage
              .from('machine-docs')
              .download(doc.storage_path);

            if (storageErr) console.error(`🚨 STORAGE DOWNLOAD ERROR FOR ${doc.file_name}:`, storageErr);

            if (fileBlob) {
              const text = await fileBlob.text();
              parts.push(`--- FILE: ${doc.file_name} ---\n${text}`);
            }
          }
        }
        machineContext = parts.join('\n\n');
      }
    }

    // Strict prompt to stop excessive generic filler
    const systemPrompt = `You are FaultMind, an industrial automation troubleshooting expert.
Machine ID: ${machineId}

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