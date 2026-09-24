import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { documentId } = await request.json();
    if (!documentId) {
      return NextResponse.json({ error: "Document ID required" }, { status: 400 });
    }

    // 1. Fetch document record
    const { data: doc, error: fetchErr } = await supabaseAdmin
      .from("machine_documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Mark as processing
    await supabaseAdmin
      .from("machine_documents")
      .update({ ocr_status: "processing" })
      .eq("id", doc.id);

    // 2. Download file from Supabase Storage
    const { data: fileBlob, error: dlError } = await supabaseAdmin.storage
      .from("machine-docs")
      .download(doc.file_path);

    if (dlError || !fileBlob) {
      await supabaseAdmin.from("machine_documents").update({ ocr_status: "failed" }).eq("id", doc.id);
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
    }

    const isImage = doc.mime_type?.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(doc.file_name);

    if (!isImage) {
      // Plain text or manual fallback
      const text = await fileBlob.text();
      await supabaseAdmin
        .from("machine_documents")
        .update({
          extracted_text: text.slice(0, 10000),
          ocr_status: "completed",
        })
        .eq("id", doc.id);

      return NextResponse.json({ success: true, mode: "text" });
    }

    // 3. Process image with GPT-4o OCR Worker
    const arrayBuffer = await fileBlob.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const mime = doc.mime_type?.startsWith("image/") ? doc.mime_type : "image/jpeg";

    const extractionPrompt = `You are an automated industrial schematic and PLC logic parser.
Extract every technical detail from this image with zero hallucination.

TARGET EXTRACTION:
1. Network / Rung Number (if visible).
2. Ladder Logic Elements: Trace all contacts (NO, NC), timers, comparators, coils, set/reset instructions.
3. Symbol Table: Extract EVERY row exactly as displayed into structured JSON:
   - symbol
   - address (e.g., I1.5, Q0.6, M9.1, T101)
   - comment (verbatim text)

RETURN STRICT JSON ONLY:
{
  "network_number": "42 or null",
  "circuit_summary": "Concise technical summary of the rung function",
  "tags": [
    {"symbol": "CPU_Input13", "address": "I1.5", "comment": "Outside Bar Position 3", "type": "input", "state": "NC"}
  ],
  "raw_readable_text": "Plain text summary of all comments and addresses for full-text search indexing"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0.0,
      messages: [
        { role: "system", content: extractionPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${base64Data}`, detail: "high" },
            },
          ],
        },
      ],
    });

    const parsedData = JSON.parse(completion.choices[0].message.content);

    // 4. Save extracted knowledge to machine_documents
    const { error: updateErr } = await supabaseAdmin
      .from("machine_documents")
      .update({
        ocr_status: "completed",
        extracted_text: parsedData.raw_readable_text || JSON.stringify(parsedData),
        structured_data: parsedData,
      })
      .eq("id", doc.id);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, data: parsedData });
  } catch (err) {
    console.error("Ingestion Worker Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
