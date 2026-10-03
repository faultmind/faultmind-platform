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

const DIAGNOSTIC_COST = 2; // 2 credits per full GPT-4o diagnostic run

export async function POST(request) {
  try {
    // 1. Authenticate Request
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

    // 2. Identify Workspace & Verify Available Credits Upfront
    const { data: memberData, error: memberErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (memberErr || !memberData) {
      return NextResponse.json(
        { error: "Workspace configuration error: Member not assigned to a workspace" },
        { status: 400 }
      );
    }

    const workspaceId = memberData.workspace_id;

    // Check workspace credit balance before performing compute
    const { data: workspace, error: workspaceErr } = await supabaseAdmin
      .from("workspaces")
      .select("available_credits")
      .eq("id", workspaceId)
      .single();

    if (workspaceErr || !workspace) {
      return NextResponse.json(
        { error: "Could not retrieve workspace credit balance" },
        { status: 400 }
      );
    }

    if ((Number(workspace.available_credits) || 0) < DIAGNOSTIC_COST) {
      return NextResponse.json(
        { error: `Insufficient credits. Diagnosis requires ${DIAGNOSTIC_COST} credits. Please top up your balance.` },
        { status: 402 }
      );
    }

    // 3. Parse Request Payload
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

    // 4. Retrieve Machine Details & Pre-Indexed Structured Documentation
    let machineContextText = "";

    if (machineId) {
      const { data: machine } = await supabaseAdmin
        .from("machines")
        .select("name, brand_model")
        .eq("id", machineId)
        .single();

      if (machine) {
        machineContextText += `Target Equipment: ${machine.name}\nController/Model: ${machine.brand_model || "Not specified"}\n`;
      }

      const { data: docs } = await supabaseAdmin
        .from("machine_documents")
        .select("file_name, file_size_bytes, structured_data, extracted_text")
        .eq("machine_id", machineId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (docs && docs.length > 0) {
        machineContextText += `Attached Machine Documentation (${docs.length} indexed files available):\n`;

        for (const doc of docs) {
          const fileSizeKb = Math.round((Number(doc.file_size_bytes) || 0) / 1024);

          if (doc.structured_data && typeof doc.structured_data === "object" && Object.keys(doc.structured_data).length > 0) {
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
            machineContextText += `\n[Text Document: ${doc.file_name}]\n${doc.extracted_text.slice(0, 3000)}\n`;
          } else {
            machineContextText += `- ${doc.file_name} (${fileSizeKb} KB - pending indexing)\n`;
          }
        }
      }
    }

    // 5. Engineering System Prompt
    const systemPrompt = `You are a Principal Industrial Automation and PLC Systems Diagnostic Engineer.
You have native expertise in industrial field engineering, electrical schematics, and PLC programming (Siemens TIA Portal/STEP 7, Delta, Allen-Bradley, Beckhoff, Omron).

When evaluating user queries:
1. PRE-INDEXED PLC DATA & SYMBOL TABLES:
   - When pre-indexed symbol tables or network data are provided in the machine specification, treat them as authoritative ground truth.
   - Distinctly differentiate CPU_Input vs CPU_Output and physical addresses (I vs Q, e.g. I1.5 vs Q1.5).
   - Match the exact symbol queried and report its absolute address and comment verbatim.
2. LADDER LOGIC CIRCUIT TRACING:
   - Identify the network number (e.g. Network 42).
   - Trace the branch: identify if contacts are normally open (NO) or normally closed (NC / negated).
   - Identify what output coil, memory flag, or timer it enables, seals-in, or interlocks.
3. SCRATCHPAD REASONING:
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

    // 6. Build Diagnostic Payload
    let promptText = `Query: ${faultQuery}`;
    if (machineContextText) {
      promptText += `\n\n--- MACHINE SPECIFICATION & ATTACHED DOCUMENTS ---\n${machineContextText}`;
    }

    // 7. Invoke Diagnostic Reasoning Engine
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptText },
      ],
      temperature: 0.1,
    });

    const parsedContent = JSON.parse(response.choices[0].message.content);

    // 8. Atomic Credit Deduction (Only Runs After Successful AI Execution)
    const { data: deductionSuccess, error: rpcError } = await supabaseAdmin.rpc("deduct_credits", {
      p_workspace_id: workspaceId,
      p_amount: DIAGNOSTIC_COST,
      p_description: "Diagnostic Reasoning Engine (GPT-4o)",
      p_metadata: { user_id: user.id }
    });

    if (rpcError || !deductionSuccess) {
      console.error("Credit deduction failed post-generation:", rpcError);
    }

    const diagnosticPayload = {
      direction: parsedContent.direction || "ltr",
      mainTitle: parsedContent.mainTitle,
      sectionOneTitle: parsedContent.sectionOneTitle,
      sectionTwoTitle: parsedContent.sectionTwoTitle,
      sectionOneItems: parsedContent.sectionOneItems || [],
      sectionTwoItems: parsedContent.sectionTwoItems || [],
    };

    // 9. Persist to Audit Log
    const { error: logError } = await supabaseAdmin
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
      });

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