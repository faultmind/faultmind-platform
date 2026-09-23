import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Admin client to verify tokens and subscription status safely
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    // 2. Parse request body
    const { faultQuery, locale } = await request.json();

    if (!faultQuery || faultQuery.trim().length === 0) {
      return NextResponse.json(
        { error: "Fault description cannot be empty" },
        { status: 400 }
      );
    }

    // 3. Structured diagnostic response
    // (This is the insertion point for your LLM or fault logic engine)
    const diagnosisResult = {
      query: faultQuery,
      status: "completed",
      probableRootCauses: [
        "Sensor 24V DC auxiliary line drop or degraded terminal contact.",
        "Emergency-stop latch loop open or unacknowledged safety relay trip.",
        "Drive bus undervoltage or overcurrent during dynamic load profile."
      ],
      recommendedActionSteps: [
        "Measure terminal rail voltage directly at the I/O block with a DMM.",
        "Inspect the online diagnostic buffer and variable table (VAT) for active interlocks.",
        "Verify motor brake release signal and check mechanical drive train for binding."
      ]
    };

    return NextResponse.json({ success: true, data: diagnosisResult });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    );
  }
}
