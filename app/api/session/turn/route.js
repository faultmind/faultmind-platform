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

    // 1. Subscription check
    const { data: subData, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .single();

    if (subError || subData?.status !== "active") {
      return NextResponse.json({ error: "Active subscription required" }, { status: 403 });
    }

    // 2. Request payload
    const { sessionId, machineId, userInput, eventType = "message" } = await request.json();

    if (!userInput?.trim()) {
      return NextResponse.json({ error: "userInput is required" }, { status: 400 });
    }

    // 3. Load or Self-Heal Active Session
    let sessionData = null;

    if (sessionId) {
      const { data, error } = await supabaseAdmin
        .from("diagnostic_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data) {
        sessionData = data;
      }
    }

    // If still null, look for existing active session for this machine
    if (!sessionData && machineId) {
      const { data: existingActive } = await supabaseAdmin
        .from("diagnostic_sessions")
        .select("*")
        .eq("machine_id", machineId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingActive) {
        sessionData = existingActive;
      }
    }

    // If still missing, automatically create a new session
    if (!sessionData) {
      const { data: newSession, error: createErr } = await supabaseAdmin
        .from("diagnostic_sessions")
        .insert({
          machine_id: machineId,
          user_id: user.id,
          title: "Active Investigation",
          active_hypothesis: "Initial assessment based on reported symptoms.",
        })
        .select()
        .single();

      if (createErr || !newSession) {
        return NextResponse.json(
          { error: `Could not create session: ${createErr?.message || "Database error"}` },
          { status: 500 }
        );
      }

      sessionData = newSession;
    }

    const activeSessionId = sessionData.id;

    // 4. Retrieve pre-indexed machine documentation
    let machineKnowledgeText = "";
    if (machineId) {
      const { data: machine } = await supabaseAdmin
        .from("machines")
        .select("name, brand_model")
        .eq("id", machineId)
        .single();

      if (machine) {
        machineKnowledgeText += `Equipment: ${machine.name} | Controller: ${machine.brand_model || "Standard PLC"}\n`;
      }

      const { data: docs } = await supabaseAdmin
        .from("machine_documents")
        .select("file_name, structured_data, extracted_text")
        .eq("machine_id", machineId)
        .eq("user_id", user.id);

      if (docs && docs.length > 0) {
        machineKnowledgeText += `\n--- PRE-INDEXED PLC LOGIC & SYMBOL TABLES ---\n`;
        for (const doc of docs) {
          if (doc.structured_data && typeof doc.structured_data === "object") {
            const d = doc.structured_data;
            machineKnowledgeText += `File: ${doc.file_name} (Network: ${d.network_number || "N/A"})\n`;
            if (d.circuit_summary) machineKnowledgeText += `Summary: ${d.circuit_summary}\n`;
            if (Array.isArray(d.tags)) {
              d.tags.forEach((t) => {
                machineKnowledgeText += `  - [${t.symbol}] ${t.address} | "${t.comment}" | Contact: ${t.state || "N/A"}\n`;
              });
            }
          } else if (doc.extracted_text) {
            machineKnowledgeText += `File ${doc.file_name}: ${doc.extracted_text.slice(0, 1000)}\n`;
          }
        }
      }
    }

    // 5. Load recent dialogue history (last 12 events)
    const { data: recentEvents } = await supabaseAdmin
      .from("diagnostic_events")
      .select("sender, content, event_type, created_at")
      .eq("session_id", activeSessionId)
      .order("created_at", { ascending: true })
      .limit(12);

    const formattedHistory = (recentEvents || []).map((ev) => ({
      role: ev.sender === "engineer" ? "user" : "assistant",
      content: ev.content,
    }));

    // 6. Record the engineer's new event
    await supabaseAdmin.from("diagnostic_events").insert({
      session_id: activeSessionId,
      sender: "engineer",
      event_type: eventType,
      content: userInput,
    });

    // 7. System prompt for co-investigative reasoning
    const systemPrompt = `You are a Principal Industrial Automation Diagnostic Engineer working live alongside a field technician.
You are investigating a machine failure interactively.

CURRENT SESSION STATE:
- Active Hypothesis: "${sessionData.active_hypothesis || "Initial assessment"}"
- Suspected Components: ${JSON.stringify(sessionData.suspected_components || [])}
- Verified Signals: ${JSON.stringify(sessionData.verified_signals || [])}
- Eliminated Causes: ${JSON.stringify(sessionData.eliminated_causes || [])}
- Active Checklist: ${JSON.stringify(sessionData.pending_tasks || [])}

DOCUMENTATION CONTEXT:
${machineKnowledgeText}

DIAGNOSTIC PROTOCOL:
1. Cross-reference user observations or test readings against PLC networks and symbol tables.
2. If the user provides a measurement or test result:
   - Determine whether it confirms or eliminates a failure branch.
   - Update the active hypothesis accordingly.
3. Keep instructions concise and task-driven:
   - Tell the technician what specific wire, terminal, PLC LED, or sensor to inspect next.
   - Do not output generic advice; specify exact tag symbols (e.g. CPU_Input13) or physical addresses (e.g. I1.5).
4. The field engineer retains sole authority to resolve or close the session. Never output session close directives.

OUTPUT STRICT JSON ONLY:
{
  "replyMessage": "Conversational reply to the engineer detailing analysis and directing next steps.",
  "statePatch": {
    "active_hypothesis": "Current working hypothesis",
    "add_verified_signals": [
      { "tag": "string", "address": "string", "expected": "string", "actual": "string", "verdict": "normal" | "faulty" | "inconclusive" }
    ],
    "add_eliminated_causes": ["Description of eliminated cause"],
    "update_suspected_components": [
      { "name": "string", "address": "string", "probability": "high" | "medium" | "low", "reason": "string" }
    ],
    "actionable_tasks": [
      {
        "id": "task_1",
        "instruction": "Specific test or inspection to run",
        "tool_required": "multimeter" | "plc_status" | "visual_check",
        "verification_type": "boolean" | "voltage" | "inspection"
      }
    ]
  }
}`;

    // 8. Call GPT-4o
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        ...formattedHistory,
        { role: "user", content: userInput },
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    const patch = parsed.statePatch || {};

    // 9. Persist assistant reply
    await supabaseAdmin.from("diagnostic_events").insert({
      session_id: activeSessionId,
      sender: "assistant",
      event_type: "message",
      content: parsed.replyMessage || "Analysis updated.",
      metadata: patch,
    });

    // 10. Merge state updates into diagnostic_sessions (session status is never overwritten here)
    const mergedVerified = [
      ...(sessionData.verified_signals || []),
      ...(patch.add_verified_signals || []),
    ];
    const mergedEliminated = Array.from(
      new Set([...(sessionData.eliminated_causes || []), ...(patch.add_eliminated_causes || [])])
    );

    const updatePayload = {
      updated_at: new Date().toISOString(),
      active_hypothesis: patch.active_hypothesis || sessionData.active_hypothesis,
      verified_signals: mergedVerified,
      eliminated_causes: mergedEliminated,
    };

    if (patch.update_suspected_components) {
      updatePayload.suspected_components = patch.update_suspected_components;
    }
    if (patch.actionable_tasks) {
      updatePayload.pending_tasks = patch.actionable_tasks;
    }

    const { data: updatedSession, error: updateErr } = await supabaseAdmin
      .from("diagnostic_sessions")
      .update(updatePayload)
      .eq("id", activeSessionId)
      .select()
      .single();

    if (updateErr) {
      console.error("State update error:", updateErr.message);
    }

    return NextResponse.json({
      success: true,
      replyMessage: parsed.replyMessage,
      session: updatedSession || updatePayload,
    });
  } catch (err) {
    console.error("Session Turn Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
