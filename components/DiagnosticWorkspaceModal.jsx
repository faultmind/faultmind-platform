"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

export default function DiagnosticWorkspaceModal({
  isOpen,
  onClose,
  machineId,
  machineName,
}) {
  const [session, setSession] = useState(null);
  const [events, setEvents] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [initError, setInitError] = useState(null);

  // Mobile responsive helpers
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState("chat"); // 'chat' | 'state'
  const chatEndRef = useRef(null);

  // Detect screen size changes
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeTab === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, activeTab]);

  // 1. Initialize or resume active session
  useEffect(() => {
    if (!isOpen || !machineId) return;

    let isMounted = true;

    async function initSession() {
      setLoading(true);
      setInitError(null);

      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr || !user) {
          throw new Error("You must be logged in to access the workspace.");
        }

        // Check for existing active session
        let { data: existingSession, error: fetchErr } = await supabase
          .from("diagnostic_sessions")
          .select("*")
          .eq("machine_id", machineId)
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fetchErr) {
          console.error("Session lookup error:", fetchErr.message);
        }

        if (!existingSession) {
          // Create new session
          const { data: newSession, error: insertErr } = await supabase
            .from("diagnostic_sessions")
            .insert({
              machine_id: machineId,
              user_id: user.id,
              title: `Investigation: ${machineName || "Line Machine"}`,
              active_hypothesis: "Awaiting initial fault symptoms...",
            })
            .select()
            .single();

          if (insertErr) {
            throw new Error(`Database error: ${insertErr.message}`);
          }
          existingSession = newSession;
        }

        if (!isMounted) return;
        setSession(existingSession);

        if (existingSession?.id) {
          const { data: history, error: historyErr } = await supabase
            .from("diagnostic_events")
            .select("*")
            .eq("session_id", existingSession.id)
            .order("created_at", { ascending: true });

          if (historyErr) {
            console.error("Event history error:", historyErr.message);
          } else if (isMounted) {
            setEvents(history || []);
          }
        }
      } catch (err) {
        console.error("Diagnostic Workspace Init Failed:", err.message);
        if (isMounted) setInitError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, [isOpen, machineId, machineName]);

  // 2. Realtime WebSocket subscription
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel(`session_feed_${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "diagnostic_events",
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          setEvents((prev) => {
            if (prev.some((e) => e.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "diagnostic_sessions",
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          setSession(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  // 3. Send message turn
  const handleSend = async (customText = null, eventType = "message") => {
    const textToSend = customText || inputText;

    if (!session?.id) {
      alert("Session not ready yet. Please wait a moment or check your connection.");
      return;
    }

    if (!textToSend.trim() || submitting) return;

    setSubmitting(true);
    setInputText("");

    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const token = authSession?.access_token;

      if (!token) {
        throw new Error("Authentication token expired. Please refresh.");
      }

      const res = await fetch("/api/session/turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: session.id,
          machineId,
          userInput: textToSend,
          eventType,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Failed to process turn");
      }
    } catch (err) {
      console.error("Workspace turn error:", err.message);
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTaskComplete = (task) => {
    const confirmationText = `Verified task [${task.instruction}]. Result: Confirmed normal / passed.`;
    handleSend(confirmationText, "task_result");
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? "0" : "1rem",
        zIndex: 1000,
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          backgroundColor: "#0B0F17",
          border: isMobile ? "none" : "1px solid #1E293B",
          borderRadius: isMobile ? "0" : "12px",
          width: "100%",
          maxWidth: "1200px",
          height: isMobile ? "100dvh" : "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.85rem 1.25rem",
            borderBottom: "1px solid #1E293B",
            backgroundColor: "#0F172A",
          }}
        >
          <div style={{ minWidth: 0, flex: 1, paddingRight: "0.5rem" }}>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? "0.95rem" : "1.1rem",
                color: "#F8FAFC",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              🛠️ {machineName || "Diagnostic Workspace"}
            </h2>
            <span style={{ fontSize: "0.7rem", color: initError ? "#EF4444" : "#38BDF8" }}>
              {loading
                ? "Connecting session..."
                : initError
                ? `Connection error: ${initError}`
                : `Status: ${session?.status?.toUpperCase() || "ACTIVE"}`}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              border: "none",
              color: "#94A3B8",
              fontSize: "1.4rem",
              cursor: "pointer",
              padding: "0.2rem 0.5rem",
            }}
          >
            ✕
          </button>
        </div>

        {/* Mobile Tab Switcher */}
        {isMobile && (
          <div
            style={{
              display: "flex",
              backgroundColor: "#0F172A",
              borderBottom: "1px solid #1E293B",
            }}
          >
            <button
              onClick={() => setActiveTab("chat")}
              style={{
                flex: 1,
                padding: "0.65rem",
                backgroundColor: activeTab === "chat" ? "#1E293B" : "transparent",
                color: activeTab === "chat" ? "#38BDF8" : "#94A3B8",
                border: "none",
                borderBottom: activeTab === "chat" ? "2px solid #38BDF8" : "none",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              💬 Dialogue
            </button>
            <button
              onClick={() => setActiveTab("state")}
              style={{
                flex: 1,
                padding: "0.65rem",
                backgroundColor: activeTab === "state" ? "#1E293B" : "transparent",
                color: activeTab === "state" ? "#38BDF8" : "#94A3B8",
                border: "none",
                borderBottom: activeTab === "state" ? "2px solid #38BDF8" : "none",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📋 Live State ({session?.pending_tasks?.length || 0})
            </button>
          </div>
        )}

        {/* Content Area */}
        <div
          style={{
            display: isMobile ? "flex" : "grid",
            gridTemplateColumns: isMobile ? "none" : "1.3fr 1fr",
            flex: 1,
            overflow: "hidden",
            flexDirection: "column",
          }}
        >
          {/* Panel 1: Dialogue */}
          {(!isMobile || activeTab === "chat") && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                borderRight: isMobile ? "none" : "1px solid #1E293B",
                backgroundColor: "#0B0F17",
                flex: 1,
                height: "100%",
                minHeight: 0,
              }}
            >
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                {events.length === 0 && !loading && (
                  <div
                    style={{
                      color: "#64748B",
                      fontSize: "0.85rem",
                      textAlign: "center",
                      marginTop: "2rem",
                    }}
                  >
                    Describe symptoms or ask about specific PLC tags to begin investigation.
                  </div>
                )}

                {events.map((ev) => {
                  const isAssistant = ev.sender === "assistant";
                  return (
                    <div
                      key={ev.id}
                      style={{
                        alignSelf: isAssistant ? "flex-start" : "flex-end",
                        maxWidth: isMobile ? "92%" : "85%",
                        backgroundColor: isAssistant ? "#0F172A" : "#1D4ED8",
                        border: isAssistant ? "1px solid #1E293B" : "none",
                        color: "#F8FAFC",
                        borderRadius: "8px",
                        padding: "0.75rem 0.9rem",
                        fontSize: "0.85rem",
                        lineHeight: "1.5",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: isAssistant ? "#38BDF8" : "#93C5FD",
                          marginBottom: "0.25rem",
                          fontWeight: 600,
                        }}
                      >
                        {isAssistant ? "AI Co-Investigator" : "Field Engineer"}
                      </div>
                      {ev.content}
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                style={{
                  display: "flex",
                  padding: "0.65rem 0.85rem",
                  borderTop: "1px solid #1E293B",
                  backgroundColor: "#0F172A",
                  gap: "0.5rem",
                }}
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    !session?.id ? "Connecting session..." : "Enter observation or multimeter reading..."
                  }
                  disabled={submitting || !session?.id}
                  style={{
                    flex: 1,
                    backgroundColor: "#0B0F17",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#F8FAFC",
                    padding: "0.55rem 0.75rem",
                    fontSize: "0.85rem",
                    outline: "none",
                    opacity: !session?.id ? 0.6 : 1,
                  }}
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || submitting || !session?.id}
                  style={{
                    backgroundColor: "#2563EB",
                    color: "#FFFFFF",
                    border: "none",
                    padding: "0.55rem 1rem",
                    borderRadius: "6px",
                    fontWeight: 600,
                    cursor: !inputText.trim() || submitting || !session?.id ? "not-allowed" : "pointer",
                    opacity: !inputText.trim() || submitting || !session?.id ? 0.5 : 1,
                    fontSize: "0.85rem",
                  }}
                >
                  {submitting ? "Analyzing..." : "Send"}
                </button>
              </form>
            </div>
          )}

          {/* Panel 2: Live State Board */}
          {(!isMobile || activeTab === "state") && (
            <div
              style={{
                padding: "1rem",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                backgroundColor: "#080C14",
                flex: 1,
                height: "100%",
              }}
            >
              {/* Working Hypothesis Card */}
              <div
                style={{
                  backgroundColor: "#0F172A",
                  border: "1px solid #1E293B",
                  borderRadius: "8px",
                  padding: "0.85rem",
                }}
              >
                <h4 style={{ margin: "0 0 0.4rem 0", fontSize: "0.75rem", color: "#FCD34D", textTransform: "uppercase" }}>
                  🎯 Active Hypothesis
                </h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#E2E8F0", lineHeight: 1.4 }}>
                  {session?.active_hypothesis || "Awaiting fault symptoms."}
                </p>
              </div>

              {/* Actionable Inspection Checklist */}
              <div
                style={{
                  backgroundColor: "#0F172A",
                  border: "1px solid #1E293B",
                  borderRadius: "8px",
                  padding: "0.85rem",
                }}
              >
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.75rem", color: "#38BDF8", textTransform: "uppercase" }}>
                  📋 Next Physical Verification Steps
                </h4>
                {(!session?.pending_tasks || session.pending_tasks.length === 0) ? (
                  <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                    No pending tests assigned.
                  </span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {session.pending_tasks.map((task, idx) => (
                      <div
                        key={task.id || idx}
                        style={{
                          backgroundColor: "#0B0F17",
                          border: "1px solid #1E293B",
                          borderRadius: "6px",
                          padding: "0.6rem 0.75rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                        }}
                      >
                        <span style={{ fontSize: "0.75rem", color: "#F1F5F9", lineHeight: 1.3 }}>
                          {task.instruction}
                        </span>
                        <button
                          onClick={() => {
                            handleTaskComplete(task);
                            if (isMobile) setActiveTab("chat");
                          }}
                          disabled={submitting}
                          style={{
                            backgroundColor: "#065F46",
                            border: "1px solid #059669",
                            color: "#A7F3D0",
                            borderRadius: "4px",
                            fontSize: "0.7rem",
                            padding: "0.3rem 0.55rem",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          ✓ Confirm
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirmed Signals & Bits */}
              <div
                style={{
                  backgroundColor: "#0F172A",
                  border: "1px solid #1E293B",
                  borderRadius: "8px",
                  padding: "0.85rem",
                }}
              >
                <h4 style={{ margin: "0 0 0.4rem 0", fontSize: "0.75rem", color: "#34D399", textTransform: "uppercase" }}>
                  ⚡ Confirmed Signals & Bits
                </h4>
                {(!session?.verified_signals || session.verified_signals.length === 0) ? (
                  <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                    No physical signals recorded yet.
                  </span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {session.verified_signals.map((s, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.75rem",
                          padding: "0.35rem 0.5rem",
                          backgroundColor: "#0B0F17",
                          borderRadius: "4px",
                        }}
                      >
                        <span style={{ color: "#E2E8F0" }}>{s.tag || s.address}</span>
                        <span
                          style={{
                            color: s.verdict === "normal" ? "#34D399" : "#F87171",
                            fontWeight: 600,
                          }}
                        >
                          {s.actual || s.verdict}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ruled Out Causes */}
              <div
                style={{
                  backgroundColor: "#0F172A",
                  border: "1px solid #1E293B",
                  borderRadius: "8px",
                  padding: "0.85rem",
                }}
              >
                <h4 style={{ margin: "0 0 0.4rem 0", fontSize: "0.75rem", color: "#94A3B8", textTransform: "uppercase" }}>
                  🛡️ Ruled Out / Healthy Circuits
                </h4>
                {(!session?.eliminated_causes || session.eliminated_causes.length === 0) ? (
                  <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                    No components eliminated yet.
                  </span>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {session.eliminated_causes.map((c, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: "0.7rem",
                          backgroundColor: "#1E293B",
                          color: "#94A3B8",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                        }}
                      >
                        ✓ {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
