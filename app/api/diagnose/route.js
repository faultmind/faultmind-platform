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

    // 4. Industrial automation system prompt (Natural language matching)
    const systemPrompt = `You are an expert senior industrial automation and electrical maintenance engineer.
Evaluate the user's input:
- If it is a FAULT or ALARM (troubleshooting scenario), provide root causes and action steps.
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

    // 5. Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Fault description: ${faultQuery}` },
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

// 6. Log diagnostic record to Supabase
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
