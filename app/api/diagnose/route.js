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

    // 3. Map language requirements
    const languageMap = {
      en: "English",
      ar: "Arabic (professional industrial engineering terminology)",
      de: "German (technische Fachbegriffe für Automatisierung)",
    };
    const targetLanguage = languageMap[locale] || "English";

    // 4. Industrial automation system prompt
    const systemPrompt = `You are an expert senior industrial automation and electrical maintenance engineer.
Analyze the user's machine fault symptoms, PLC alarm codes, sensor issues, or drive failures.
Provide precise, practical, actionable diagnostics focusing on:
- Hardware, sensor loop integrity, 24V DC auxiliary power rails.
- PLC logic interlocks, safety relays, and diagnostic buffers (VAT/tag tables).
- Motor protection, VFD fault codes, and mechanical drive binding.

CRITICAL INSTRUCTIONS:
- You MUST answer in ${targetLanguage}.
- Return ONLY a valid JSON object matching this schema:
{
  "probableRootCauses": ["Cause 1", "Cause 2", "Cause 3"],
  "recommendedActionSteps": ["Step 1", "Step 2", "Step 3"]
}
- Do not add markdown blocks (\`\`\`json) outside the JSON.`;

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
