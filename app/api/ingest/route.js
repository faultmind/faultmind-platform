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
    // 1. Authenticate Request
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

    // 2. Locate User's Workspace for Billing
    const { data: memberData, error: memberErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (memberErr || !memberData) {
      return NextResponse.json({ error: "Workspace configuration error" }, { status: 400 });
    }
    const workspaceId = memberData.workspace_id;
    const ingestionCost = 1; // 1 credit per file ingestion

    // 3. ATOMIC CREDIT DEDUCTION (Toll Booth)
    const { data: hasCredits, error: rpcError } = await supabaseAdmin.rpc("deduct_credits", {
      p_workspace_id: workspaceId,
      p_amount: ingestionCost,
      p_description: `AI Ingestion for Document: ${documentId}`,
    });

    if (rpcError || !hasCredits) {
      return NextResponse.json({ 
        error: "Insufficient credits. Please upgrade your workspace plan to ingest more files." 
      }, { status: 402 });
    }

    // 4. Fetch document record
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

    // 5. Download file from Supabase Storage
    const { data: fileBlob, error: dlError } = await supabaseAdmin.storage
      .from("machine-docs")
      .download(doc.file_path);

    if (dlError || !fileBlob) {
      await supabaseAdmin.from("machine_documents").update({ ocr_status: "failed" }).eq("id", doc.id);
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
    }

    const isImage = doc.mime_type?.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(doc.file_name);
    let parsedData = null;

    // 6. PROCESS BASED ON FILE TYPE
    if (isImage) {
      // --- IMAGE OCR PIPELINE (Schematics / Electrical Drawings) ---
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");
      const mime = doc.mime_type?.startsWith("image/") ? doc.mime_type : "image/jpeg";

      const imagePrompt = `You are an automated industrial schematic and PLC logic parser.
      Extract every technical detail from this image with zero hallucination.
      TARGET EXTRACTION:
      1. Network / Rung Number (if visible).
      2. Ladder Logic Elements: Trace all contacts (NO, NC), timers, comparators, coils, set/reset instructions.
      3. Symbol Table: Extract EVERY row exactly as displayed into structured JSON.
      RETURN STRICT JSON ONLY:
      {
        "network_number": "42 or null",
        "circuit_summary": "Concise technical summary of the rung function",
        "tags": [ {"symbol": "CPU_Input13", "address": "I1.5", "comment": "Outside Bar Position 3", "type": "input", "state": "NC"} ],
        "raw_readable_text": "Plain text summary of all comments and addresses for full-text search indexing"
      }`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: 0.0,
        messages: [
          { role: "system", content: imagePrompt },
          { role: "user", content: [{ type: "image_url", image_url: { url: `data:${mime};base64,${base64Data}`, detail: "high" } }] }
        ],
      });
      parsedData = JSON.parse(completion.choices[0].message.content);

    } else {
      // --- TEXT PIPELINE (.awl, .xml, .scl, .txt) ---
      const textContent = await fileBlob.text();
      
      const textPrompt = `You are an expert Siemens and Allen-Bradley industrial automation engineer.
      Parse the following PLC code export (.awl, .xml, etc.) and extract the structured logic and symbols.
      TARGET EXTRACTION:
      1. Logic Blocks / Network structure.
      2. Tag mapping (Addresses to Symbols and Comments).
      RETURN STRICT JSON ONLY:
      {
        "circuit_summary": "Concise technical summary of the logic provided",
        "tags": [ {"symbol": "MotorStart", "address": "Q0.1", "comment": "Main Conveyor Motor", "type": "output"} ],
        "raw_readable_text": "Plain text summary of all comments, blocks, and addresses for full-text search indexing"
      }`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Using gpt-4o-mini for fast, cheap, highly-accurate text extraction
        response_format: { type: "json_object" },
        temperature: 0.0,
        messages: [
          { role: "system", content: textPrompt },
          { role: "user", content: textContent.slice(0, 80000) } // Cap characters to avoid massive token limit overages on huge files
        ],
      });
      parsedData = JSON.parse(completion.choices[0].message.content);
    }

    // 7. Save extracted knowledge to machine_documents
    const { error: updateErr } = await supabaseAdmin
      .from("machine_documents")
      .update({
        ocr_status: "completed",
        extracted_text: parsedData.raw_readable_text || "No readable text extracted",
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