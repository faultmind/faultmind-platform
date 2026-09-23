import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Supabase Admin for verifying Auth & Subscription
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

    // 2. Parse request payload
    const { faultQuery, locale = "en" } = await request.json();

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
    // Inside app/api/diagnose/route.js

const systemPrompt = `You are an expert senior industrial automation and electrical maintenance engineer.
Analyze the user's machine fault symptoms, PLC alarm codes, sensor issues, or drive failures.
Provide precise, practical, actionable diagnostics focusing on:
- Hardware, sensor loop integrity, and 24V DC auxiliary power rails.
- PLC logic interlocks, safety relays, and diagnostic buffers (VAT/tag tables).
- Motor protection, VFD fault codes, and mechanical drive binding.

CRITICAL LANGUAGE RULE:
- Detect the exact language used by the user in the fault description and respond entirely in that language.
- Translate the section titles ("findingsTitle", "rootCausesTitle", "actionStepsTitle") into the detected language as well.
- Determine if the language is right-to-left ("rtl" for Arabic, Hebrew, Urdu) or left-to-right ("ltr" for English, German, etc.).
- If the input is purely technical codes or numbers without linguistic clues, fallback to ${fallbackLang}.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "direction": "rtl" | "ltr",
  "findingsTitle": "Localized heading for Diagnostic Findings",
  "rootCausesTitle": "Localized heading for Probable Root Causes",
  "actionStepsTitle": "Localized heading for Recommended Action Steps",
  "probableRootCauses": ["Cause 1", "Cause 2", "Cause 3"],
  "recommendedActionSteps": ["Step 1", "Step 2", "Step 3"]
}
Do not add markdown blocks (\`\`\`json) outside the JSON.`;
    
    // 5. Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cost-effective, high speed, and accurate for structured parsing
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Fault description: ${faultQuery}` },
      ],
      temperature: 0.2, // Low temperature for consistent, factual troubleshooting steps
    });

    const parsedContent = JSON.parse(response.choices[0].message.content);

return NextResponse.json({
  success: true,
  data: {
    query: faultQuery,
    direction: parsedContent.direction || "ltr",
    findingsTitle: parsedContent.findingsTitle,
    rootCausesTitle: parsedContent.rootCausesTitle,
    actionStepsTitle: parsedContent.actionStepsTitle,
    probableRootCauses: parsedContent.probableRootCauses || [],
    recommendedActionSteps: parsedContent.recommendedActionSteps || [],
  },
});
    
  } catch (err) {
    console.error("Diagnosis API Error:", err);
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    );
  }
}
