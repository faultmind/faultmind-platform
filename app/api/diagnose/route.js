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
      return NextResponse.json(
        { error: "Unauthorized: Missing auth token" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid session" },
        { status: 401 }
      );
    }

    // 1. Verify active subscription
    const { data: subData, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .single();

    if (subError || subData?.status !== "active") {
      return NextResponse.json(
        { error: "Forbidden: Active subscription required" },
        { status: 403 }
      );
    }

    // 2. Parse request payload
    const { faultQuery, locale = "en", machineId = null } = await request.json();

    if (!faultQuery || faultQuery.trim().length === 0) {
      return NextResponse.json(
        { error: "Fault description cannot be empty" },
        { status: 400 }
      );
    }

    const fallbackLanguageMap = {
      en: "English",
      ar: "Arabic",
      de: "German",
    };
    const fallbackLang = fallbackLanguageMap[locale] || "English";

    // 3. Retrieve Machine Details & Attached Documentation
    let machineContextText = "";
    const imagePayloads = [];

    if (machineId) {
      const { data: machine } = await supabaseAdmin
        .from("machines")
        .select("name, brand_model")
        .eq("id", machineId)
        .single();

      if (machine) {
        machineContextText += `Target Equipment: ${machine.name}\nController/Model: ${machine.brand_model || "Not specified"}\n`;
      }

      // Fetch attached documents for this machine
      const { data: docs, error: dErr } = await supabaseAdmin
        .from("machine_documents")
        .select("id, file_name, file_path, mime_type, file_size_bytes, ocr_status, structured_data, extracted_text")
        .eq("machine_id", machineId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (docs && docs.length > 0) {
        machineContextText += `Attached Machine Documentation (${docs.length} files available):\n`;

        let structuredKnowledgeFound = false;

        for (const doc of docs) {
          const fileSizeKb = Math.round((Number(doc.file_size_bytes) || 0) / 1024);

          // A. If pre-indexed structured data exists from ingestion worker, inject directly as text
          if (doc.structured_data && typeof doc.structured_data === "object" && Object.keys(doc.structured_data).length > 0) {
            structuredKnowledgeFound = true;
            const data = doc.structured_data;
            machineContextText += `\n[Indexed Document: ${doc.file_name} | Network: ${data.network_number || "N/A"}]\n`;
            if (data.circuit_summary) {
              machineContextText += `Circuit Summary: ${data.circuit_summary}\n`;
            }
            if (Array.isArray(data.tags) && data.tags.length > 0) {
              machineContextText += `Extracted Symbol Table:\n`;
              data.tags.forEach((t) => {
                machineContextText += `  - Symbol: ${t.symbol} | Address: ${t.address} | Comment: "${t.comment}" | Contact State: ${t.state || "N/A"}\n`;
              });
            }
          } else if (doc.extracted_text) {
            machineContextText += `\n[Text Document: ${doc.file_name}]\n${doc.extracted_text.slice(0, 1500)}\n`;
          } else {
            machineContextText += `- ${doc.file_name} (${fileSizeKb} KB)\n`;
          }

          // B. Visual fallback: If not yet indexed, pass images directly into the vision pipeline
          const isImage =
            doc.mime_type?.startsWith("image/") ||
            /\.(png|jpe?g|webp|bmp)$/i.test(doc.file_name);

          if (isImage && imagePayloads.length < 20) {
            try {
              const { data: fileBlob, error: dlError } = await supabaseAdmin.storage
                .from("machine-docs")
                .download(doc.file_path);

              if (!dlError && fileBlob) {
                const arrayBuffer = await fileBlob.arrayBuffer();
                const base64Data = Buffer.from(arrayBuffer).toString("base64");
                const mime =
                  doc.mime_type && doc.mime_type.startsWith("image/")
                    ? doc.mime_type
                    : doc.file_name.endsWith(".png")
                    ? "image/png"
                    : "image/jpeg";

                imagePayloads.push({
                  type: "image_url",
                  image_url: {
                    url: `data:${mime};base64,${base64Data}`,
                    detail: "high",
                  },
                });
              }
            } catch (err) {
              console.warn(`Storage download failed for ${doc.file_name}:`, err.message);
            }
          }
        }
      }
    }

    // 4. Engineering System Prompt
    const systemPrompt = `You are a Principal Industrial Automation and PLC Systems Diagnostic Engineer.
You have native expertise in industrial field engineering, electrical schematics, and PLC programming (Siemens TIA Portal/STEP 7, Delta, Allen-Bradley, Beckhoff, Omron).

When evaluating user queries:
1. PRE-INDEXED PLC DATA & SYMBOL TABLES:
   - When pre-indexed symbol tables or network data are provided in the machine specification, treat them as authoritative ground truth.
   - Distinctly differentiate CPU_Input vs CPU_Output and physical addresses (I vs Q, e.g. I1.5 vs Q1.5).
   - Match the exact symbol queried and report its absolute address and comment verbatim.
2. SPATIAL ALIGNMENT (FOR ATTACHED SCHEMATIC IMAGES):
   - Tables with columns like "Symbol | Address | Comment" must be aligned horizontally with extreme care.
   - Do NOT mix adjacent rows. Ensure the Comment matches the EXACT row of the requested Symbol.
3. LADDER LOGIC CIRCUIT TRACING:
   - Identify the network number (e.g. Network 42).
   - Trace the branch: identify if contacts are normally open (NO) or normally closed (NC / negated).
   - Identify what output coil, memory flag, or timer it enables, seals-in, or interlocks.
4. SCRATCHPAD REASONING:
   - In your JSON response, first fill the "visualScratchpad" key with the exact raw row you extracted (Symbol, Address, Comment verbatim) before formulating the final explanation.

LANGUAGE & FORMAT:
- Respond in the exact language of the query.
- Detect "direction" as "rtl" for Arabic or "ltr" for English/German.
- If input has no linguistic text (pure fault codes), fallback to ${fallbackLang}.

OUTPUT SCHEMA (Strict JSON only):
{
  "direction": "rtl" | "ltr",
  "visualScratchpad": "Verbatim row: [Symbol] | [Address] | [Comment], Network number, and contact type",
  "mainTitle": "Localized concise title",
  "sectionOneTitle": "Contextual title (e.g. Symbol & Signal Specifications)",
  "sectionTwoTitle": "Contextual title (e.g. Logic Circuit Function & Interlock Actions)",
  "sectionOneItems": ["Point 1", "Point 2"],
  "sectionTwoItems": ["Action/Function 1", "Action/Function 2"]
}`;

    // 5. Build multimodal payload
    let promptText = `Query: ${faultQuery}`;
    if (machineContextText) {
      promptText += `\n\n--- MACHINE SPECIFICATION & ATTACHED DOCUMENTS ---\n${machineContextText}`;
    }

    let userContent = [{ type: "text", text: promptText }];
    if (imagePayloads.length > 0) {
      userContent = [...userContent, ...imagePayloads];
    }

    // 6. Call Flagship GPT-4o Model
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
    });

    const parsedContent = JSON.parse(response.choices[0].message.content);

    const diagnosticPayload = {
      direction: parsedContent.direction || "ltr",
      mainTitle: parsedContent.mainTitle,
      sectionOneTitle: parsedContent.sectionOneTitle,
      sectionTwoTitle: parsedContent.sectionTwoTitle,
      sectionOneItems: parsedContent.sectionOneItems || [],
      sectionTwoItems: parsedContent.sectionTwoItems || [],
    };

    // 7. Persist to database
    const { data: insertedLog, error: logError } = await supabaseAdmin
      .from("diagnostic_logs")
      .insert({
        user_id: user.id,
        machine_id: machineId || null,
        query_text: faultQuery,
        locale: locale || "en",
        direction: diagnosticPayload.direction,
        main_title: diagnosticPayload.mainTitle || "Diagnostic Findings",
        section_one_title: diagnosticPayload.sectionOneTitle || "Findings",
        section_two_title: diagnosticPayload.sectionTwoTitle || "Recommendations",
        section_one_items: diagnosticPayload.sectionOneItems || [],
        section_two_items: diagnosticPayload.sectionTwoItems || [],
      })
      .select()
      .single();

    if (logError) {
      console.error("DIAGNOSTIC LOG INSERT FAILED:", logError);
    }

    return NextResponse.json({
      success: true,
      data: diagnosticPayload,
    });
  } catch (err) {
    console.error("Diagnosis API Error:", err);
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    );
  }
}
