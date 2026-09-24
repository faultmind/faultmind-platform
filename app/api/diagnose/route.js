import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Supabase Admin for verifying Auth, Subscription & saving logs
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// OpenAI Client
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

    // 2. Parse request payload (including optional machineId)
    const { faultQuery, locale = "en", machineId = null } = await request.json();

    if (!faultQuery || faultQuery.trim().length === 0) {
      return NextResponse.json(
        { error: "Fault description cannot be empty" },
        { status: 400 }
      );
    }

    // 3. Fallback locale name if the query has no linguistic text (e.g. only fault codes)
    const fallbackLanguageMap = {
      en: "English",
      ar: "Arabic",
      de: "German",
    };
    const fallbackLang = fallbackLanguageMap[locale] || "English";

// 4. Retrieve Machine Details & Attached Documentation
    let machineContextText = "";
    const imagePayloads = [];

    console.log("--> API Received machineId:", machineId);

    if (machineId) {
      // Fetch machine profile
      const { data: machine } = await supabaseAdmin
        .from("machines")
        .select("name, brand_model")
        .eq("id", machineId)
        .single();

      if (machine) {
        machineContextText += `Target Equipment: ${machine.name}\nController/Model: ${machine.brand_model || "Not specified"}\n`;
      }

      // Fetch all attached documents for this machine
      const { data: docs } = await supabaseAdmin
        .from("machine_documents")
        .select("file_name, file_path, mime_type, file_size_bytes")
        .eq("machine_id", machineId)
        .order("created_at", { ascending: true });

      console.log(`--> Found ${docs?.length || 0} documents in DB for machine: ${machineId}`);

      if (docs && docs.length > 0) {
        for (const doc of docs) {
          const isImage =
            doc.mime_type?.startsWith("image/") ||
            /\.(png|jpe?g|webp|bmp)$/i.test(doc.file_name);

          // Allow up to 20 images so the ladder logic screenshot is included
          if (isImage && imagePayloads.length < 20) {
            try {
              const { data: fileBlob, error: dlError } = await supabaseAdmin.storage
                .from("machine-docs")
                .download(doc.file_path);

              if (dlError) {
                console.error(`--> Storage download error on ${doc.file_name}:`, dlError.message);
                continue;
              }

              if (fileBlob) {
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
                console.log(`--> Successfully attached image: ${doc.file_name}`);
              }
            } catch (err) {
              console.error(`--> Exception loading ${doc.file_name}:`, err.message);
            }
          }
        }
      }
    }
    console.log(`--> Total images delivered to OpenAI: ${imagePayloads.length}`);
    
    // 5. Industrial automation system prompt (Natural language matching)
    const systemPrompt = `You are an expert senior industrial automation and electrical maintenance engineer.
Evaluate the user's input alongside any machine profile details and attached documentation or schematics:
- If it is a FAULT or ALARM (troubleshooting scenario), provide root causes and action steps referring directly to the machine model and schematics when applicable.
- If it is a GENERAL QUESTION, PROCEDURE, or TOOLING QUERY (e.g., "how to test...", "what device to use..."), provide direct recommendations/key points under section 1, and procedural steps/instructions under section 2.

CRITICAL INSTRUCTIONS:
- Adapt the section titles ("sectionOneTitle", "sectionTwoTitle") naturally to the question context.
  * For faults: e.g. "Probable Root Causes" & "Recommended Action Steps" (or their Arabic/German equivalents).
  * For general inquiries: e.g. "Recommended Tools & Equipment" & "Testing Procedure" (or "Key Considerations" & "Implementation Steps").
- Respond in the EXACT same language as the user's input.
- Detect "direction" as "rtl" for Arabic/Hebrew/Urdu or "ltr" for English/German.
- If the input consists purely of numbers/codes without linguistic context, fallback to ${fallbackLang}.

OUTPUT SCHEMA (JSON only):
{
  "direction": "rtl" | "ltr",
  "mainTitle": "Localized Main Header (e.g., Diagnostic Findings, Technical Guidance, Equipment Recommendation)",
  "sectionOneTitle": "Context-accurate title for list 1",
  "sectionTwoTitle": "Context-accurate title for list 2",
  "sectionOneItems": ["Point 1", "Point 2"],
  "sectionTwoItems": ["Step 1", "Step 2"]
}`;

    // 6. Build User Message Content (Supports Multimodal Images)
    let promptText = `Fault description: ${faultQuery}`;
    if (machineContextText) {
      promptText += `\n\n--- MACHINE SPECIFICATION & ATTACHED DOCUMENTS ---\n${machineContextText}`;
    }

    let userContent = [{ type: "text", text: promptText }];
    if (imagePayloads.length > 0) {
      userContent = [...userContent, ...imagePayloads];
    }

    // 7. Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
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

    // 8. Log diagnostic record to Supabase
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
    } else {
      console.log("DIAGNOSTIC LOG SAVED SUCCESSFULLY:", insertedLog?.id);
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
