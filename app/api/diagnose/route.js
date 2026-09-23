import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase with the service role to verify the requesting user
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
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid session" },
        { status: 401 }
      );
    }

    // Verify active subscription status
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

    const { faultQuery, locale } = await request.json();

    if (!faultQuery || faultQuery.trim().length === 0) {
      return NextResponse.json(
        { error: "Fault query cannot be empty" },
        { status: 400 }
      );
    }

    // Placeholder diagnostic output structure (ready for LLM/rule engine connection)
    const diagnosisResult = {
      query: faultQuery,
      status: "completed",
      probableRootCauses: [
        "Sensor input signal dropout or degraded wiring connection.",
        "Internal PLC latch condition unresolved after emergency-stop reset.",
        "VFD overcurrent trip during rapid acceleration profile."
      ],
      recommendedActionSteps: [
        "Verify 24V DC auxiliary power rail at the terminal strip.",
        "Inspect corresponding input bit status in online monitoring / VAT table.",
        "Check mechanical drive assembly for jamming before resetting motor protection."
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
