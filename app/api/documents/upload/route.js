import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { createRequire } from 'module';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Initialize native Node.js CommonJS loader
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Helper to split text into overlapping chunks
function chunkText(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  let startIndex = 0;
  while (startIndex < text.length) {
    const chunk = text.slice(startIndex, startIndex + chunkSize);
    chunks.push(chunk.trim());
    startIndex += chunkSize - overlap;
  }
  return chunks.filter((c) => c.length > 50);
}

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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (!user || authError) {
      return new Response('Unauthorized', { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const machineId = formData.get('machineId');

    if (!file || !machineId) {
      return new Response('Missing file or machine ID', { status: 400 });
    }

    // 1. Extract text using native CommonJS require
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfData = await pdfParse(buffer);
    const rawText = pdfData.text;

    if (!rawText || rawText.trim().length === 0) {
      return new Response('No extractable text found in PDF.', { status: 400 });
    }

    // 2. Chunk text
    const chunks = chunkText(rawText);

    // 3. Generate 1536-dim vector embeddings
    const { embeddings } = await embedMany({
      model: openai.embedding('text-embedding-3-small'),
      values: chunks,
    });

    // 4. Batch insert into Supabase
    const rowsToInsert = chunks.map((chunk, index) => ({
      machine_id: machineId,
      user_id: user.id,
      file_name: file.name,
      content: chunk,
      embedding: embeddings[index],
    }));

    const { error: insertError } = await supabase
      .from('machine_documents')
      .insert(rowsToInsert);

    if (insertError) throw insertError;

    return Response.json({ success: true, chunksCount: chunks.length });
  } catch (error) {
    console.error('Document processing error:', error);
    return new Response(`Upload failed: ${error.message}`, { status: 500 });
  }
}