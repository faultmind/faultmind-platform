import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid user session" }, { status: 401 });
    }

    const { sessionId, finalRootCause } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // 1. Verify session ownership
    const { data: sessionData, error: sessionErr } = await supabaseAdmin
      .from("diagnostic_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionErr || !sessionData) {
      return NextResponse.json({ error: "Diagnostic session not found" }, { status: 404 });
    }

    // 2. Mark session resolved and update root cause
    const resolvedCause = finalRootCause?.trim() || sessionData.active_hypothesis;

    const { data: updatedSession, error: updateErr } = await supabaseAdmin
      .from("diagnostic_sessions")
      .update({
        status: "resolved",
        active_hypothesis: resolvedCause,
        pending_tasks: [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 3. Log closing event in diagnostic history feed
    await supabaseAdmin.from("diagnostic_events").insert({
      session_id: sessionId,
      sender: "assistant",
      event_type: "session_resolved",
      content: ` Incident marked as resolved. Final Root Cause: ${resolvedCause}`,
    });

    return NextResponse.json({
      success: true,
      session: updatedSession,
    });
  } catch (err) {
    console.error("Session resolve route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
