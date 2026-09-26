"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { supabase } from "../../../lib/supabaseClient";
import DiagnosticWorkspaceModal from "../../../components/DiagnosticWorkspaceModal";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 1 ? 0 : 1)} ${sizes[i]}`;
}

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Machine management state
  const [machines, setMachines] = useState([]);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [newMachineName, setNewMachineName] = useState("");
  const [newMachineModel, setNewMachineModel] = useState("");
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Session state management
  const [activeSession, setActiveSession] = useState(null);
  const [pastSessions, setPastSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [showWorkspace, setShowWorkspace] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [showManageModal, setShowManageModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Delete a document from both Storage and Database
  const handleDeleteFile = async (doc) => {
    if (!window.confirm(t("confirmDelete") || "Are you sure you want to delete this file?")) {
      return;
    }

    setDeletingId(doc.id);
    setErrorMsg("");

    try {
      const { error: storageError } = await supabase.storage
        .from("machine-docs")
        .remove([doc.file_path]);

      if (storageError) {
        console.warn("Storage deletion warning:", storageError.message);
      }

      const { error: dbError } = await supabase
        .from("machine_documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) throw dbError;

      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      console.error("Delete Error:", err);
      alert(err.message || "Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  };

  const totalBytes = (documents || []).reduce(
    (acc, doc) => acc + (Number(doc?.file_size_bytes) || 0),
    0
  );

  // Initialize Dashboard
  useEffect(() => {
    async function initDashboard() {
      setLoading(true);

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.replace(`/${locale}`);
        return;
      }

      const { data: subData, error: subError } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", currentUser.id)
        .single();

      if (subError || subData?.status !== "active") {
        router.replace(`/${locale}?error=no_active_sub`);
        return;
      }

      setUser(currentUser);
      await fetchMachines(currentUser.id);
      setLoading(false);
    }

    initDashboard();
  }, [locale, router]);

  // Load user's machines
  async function fetchMachines(userId) {
    const { data } = await supabase
      .from("machines")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setMachines(data || []);
  }

  // Load machine sessions (active investigation + past incidents)
  useEffect(() => {
    if (!selectedMachineId) {
      setActiveSession(null);
      setPastSessions([]);
      return;
    }

    async function loadMachineSessions() {
      const activeUser = user || (await supabase.auth.getUser()).data?.user;
      if (!activeUser) return;

      // 1. Fetch current active session
      const { data: active } = await supabase
        .from("diagnostic_sessions")
        .select("*")
        .eq("machine_id", selectedMachineId)
        .eq("user_id", activeUser.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveSession(active || null);

      // 2. Fetch past resolved or closed incident sessions
      const { data: past } = await supabase
        .from("diagnostic_sessions")
        .select("*")
        .eq("machine_id", selectedMachineId)
        .eq("user_id", activeUser.id)
        .neq("status", "active")
        .order("created_at", { ascending: false })
        .limit(15);

      setPastSessions(past || []);
    }

    loadMachineSessions();
  }, [selectedMachineId, showWorkspace, user]);

  // Fetch documents and listen for live Realtime updates
  useEffect(() => {
    if (!selectedMachineId) {
      setDocuments([]);
      return;
    }

    async function loadDocs() {
      const { data } = await supabase
        .from("machine_documents")
        .select("*")
        .eq("machine_id", selectedMachineId)
        .order("created_at", { ascending: false });
      setDocuments(data || []);
    }

    loadDocs();

    const channel = supabase
      .channel(`machine_docs_${selectedMachineId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "machine_documents",
          filter: `machine_id=eq.${selectedMachineId}`,
        },
        (payload) => {
          setDocuments((prev) =>
            prev.map((doc) =>
              doc.id === payload.new.id ? { ...doc, ...payload.new } : doc
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "machine_documents",
          filter: `machine_id=eq.${selectedMachineId}`,
        },
        (payload) => {
          setDocuments((prev) => {
            if (prev.some((doc) => doc.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "machine_documents",
          filter: `machine_id=eq.${selectedMachineId}`,
        },
        (payload) => {
          setDocuments((prev) => prev.filter((doc) => doc.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedMachineId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace(`/${locale}`);
  };

  // Add new machine record
  const handleCreateMachine = async (e) => {
    e.preventDefault();
    if (!newMachineName.trim()) return;

    setErrorMsg("");

    try {
      const activeUser = user || (await supabase.auth.getUser()).data?.user;
      if (!activeUser) throw new Error("User session expired. Please sign in again.");

      const { data, error } = await supabase
        .from("machines")
        .insert([
          {
            user_id: activeUser.id,
            name: newMachineName.trim(),
            brand_model: newMachineModel.trim() || null,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setMachines((prev) => [data, ...prev]);
        setSelectedMachineId(data.id);
        setNewMachineName("");
        setNewMachineModel("");
        setShowAddMachine(false);
      }
    } catch (err) {
      console.error("Machine Creation Error:", err);
      setErrorMsg(err.message || "Failed to create machine");
    }
  };

  // Upload file and trigger background ingestion
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !selectedMachineId) return;

    setUploading(true);
    setErrorMsg("");

    try {
      const activeUser = user || (await supabase.auth.getUser()).data?.user;
      if (!activeUser) throw new Error("Active session not found. Please log in.");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const uploadedDocs = [];

      for (const file of files) {
        const cleanFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const filePath = `${activeUser.id}/${selectedMachineId}/${cleanFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("machine-docs")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: docData, error: dbError } = await supabase
          .from("machine_documents")
          .insert({
            machine_id: selectedMachineId,
            user_id: activeUser.id,
            file_name: file.name,
            file_path: filePath,
            file_size_bytes: file.size,
            mime_type: file.type || "application/octet-stream",
            ocr_status: "pending",
          })
          .select()
          .single();

        if (dbError) throw dbError;

        uploadedDocs.push(docData);

        if (token && docData?.id) {
          fetch("/api/ingest", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ documentId: docData.id }),
          })
            .then(async (res) => {
              if (res.ok) {
                setDocuments((currentDocs) =>
                  currentDocs.map((d) =>
                    d.id === docData.id ? { ...d, ocr_status: "completed" } : d
                  )
                );
              }
            })
            .catch((e) => console.warn("Background ingestion trigger failed:", e.message));
        }
      }

      setDocuments((prev) => [...uploadedDocs, ...prev]);
    } catch (err) {
      console.error("Upload failure:", err);
      setErrorMsg(err.message || "Failed to upload one or more files");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0B0F17",
          color: "#94A3B8",
          fontFamily: "sans-serif",
        }}
      >
        <p>{t("loading") || "Loading diagnostics workspace..."}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0B0F17",
        color: "#F8FAFC",
        fontFamily: "sans-serif",
        padding: "2rem",
      }}
    >
      {/* Top Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "1200px",
          margin: "0 auto 2.5rem auto",
          borderBottom: "1px solid #1E293B",
          paddingBottom: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            {t("title") || "FaultMind Workstation"}
          </h1>
          <p style={{ color: "#94A3B8", fontSize: "0.875rem", margin: "0.25rem 0 0 0" }}>
            {user?.email}
          </p>
        </div>

        <button
          onClick={handleSignOut}
          style={{
            backgroundColor: "#1E293B",
            color: "#F8FAFC",
            border: "1px solid #334155",
            padding: "0.5rem 1rem",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          {t("signOut")}
        </button>
      </header>

      {/* Main Grid Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: "2rem",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        {/* Left Column: Machine Management & Command Center */}
        <main>
          {/* Machine Selection & Add Machine Bar */}
          <div
            style={{
              backgroundColor: "#0F172A",
              border: "1px solid #1E293B",
              borderRadius: "8px",
              padding: "1rem 1.5rem",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ flex: 1, minWidth: "220px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: "#94A3B8",
                  marginBottom: "0.35rem",
                }}
              >
                {t("selectMachine") || "Select Equipment Under Investigation"}
              </label>
              <select
                value={selectedMachineId}
                onChange={(e) => setSelectedMachineId(e.target.value)}
                style={{
                  width: "100%",
                  backgroundColor: "#0B0F17",
                  border: "1px solid #334155",
                  color: "#F8FAFC",
                  padding: "0.5rem",
                  borderRadius: "6px",
                }}
              >
                <option value="">
                  {t("noMachine") || "-- Select Machine to Start --"}
                </option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.brand_model ? `(${m.brand_model})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowAddMachine(!showAddMachine)}
              style={{
                backgroundColor: "#1E293B",
                color: "#38BDF8",
                border: "1px solid #334155",
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.85rem",
                marginTop: "1.2rem",
              }}
            >
              {t("addMachineBtn") || "+ Add Machine"}
            </button>
          </div>

          {/* Add Machine Inline Form */}
          {showAddMachine && (
            <form
              onSubmit={handleCreateMachine}
              style={{
                backgroundColor: "#0F172A",
                border: "1px solid #334155",
                borderRadius: "8px",
                padding: "1rem 1.5rem",
                marginBottom: "1.5rem",
                display: "flex",
                gap: "1rem",
                alignItems: "flex-end",
              }}
            >
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
                  {t("machineName") || "Machine Name"}
                </label>
                <input
                  required
                  value={newMachineName}
                  onChange={(e) => setNewMachineName(e.target.value)}
                  placeholder="e.g. Line 1 Extruder"
                  style={{
                    width: "100%",
                    backgroundColor: "#0B0F17",
                    border: "1px solid #334155",
                    color: "#F8FAFC",
                    padding: "0.5rem",
                    borderRadius: "4px",
                    marginTop: "0.25rem",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
                  {t("machineModel") || "PLC / Controller Model"}
                </label>
                <input
                  value={newMachineModel}
                  onChange={(e) => setNewMachineModel(e.target.value)}
                  placeholder="e.g. Siemens S7-1500"
                  style={{
                    width: "100%",
                    backgroundColor: "#0B0F17",
                    border: "1px solid #334155",
                    color: "#F8FAFC",
                    padding: "0.5rem",
                    borderRadius: "4px",
                    marginTop: "0.25rem",
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  backgroundColor: "#2563EB",
                  color: "#FFFFFF",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {t("saveMachine") || "Save"}
              </button>
            </form>
          )}

          {/* Machine Document Attachments Bar */}
          {selectedMachineId && (
            <div
              style={{
                backgroundColor: "#0F172A",
                border: "1px dashed #334155",
                borderRadius: "8px",
                padding: "1rem 1.5rem",
                marginBottom: "1.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.85rem", color: "#94A3B8" }}>
                  Attached Documents: {documents.length} ({formatBytes(totalBytes)})
                </span>

                {documents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowManageModal(true)}
                    style={{
                      backgroundColor: "transparent",
                      border: "none",
                      color: "#38BDF8",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      padding: "0.2rem 0.5rem",
                      textDecoration: "underline",
                    }}
                  >
                    {t("manageFiles") || "Manage Files"}
                  </button>
                )}
              </div>

              <label
                style={{
                  backgroundColor: "#1E293B",
                  color: "#38BDF8",
                  padding: "0.4rem 0.85rem",
                  borderRadius: "6px",
                  cursor: uploading ? "not-allowed" : "pointer",
                  fontSize: "0.825rem",
                  border: "1px solid #334155",
                  fontWeight: 500,
                }}
              >
                {uploading ? "Uploading & Indexing..." : "Attach Manual / Schematic"}
                <input
                  type="file"
                  multiple
                  disabled={uploading}
                  onChange={handleFileUpload}
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  style={{ display: "none" }}
                />
              </label>
            </div>
          )}

          {/* Error Message Display */}
          {errorMsg && (
            <p
              dir="auto"
              style={{
                color: "#EF4444",
                marginBottom: "1.5rem",
                fontSize: "0.9rem",
                textAlign: "start",
              }}
            >
              {errorMsg}
            </p>
          )}

          {/* Primary Diagnostic Command Center */}
          <div
            style={{
              backgroundColor: "#0F172A",
              border: "1px solid #1E293B",
              borderRadius: "10px",
              padding: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
                  🛠️ Active Incident Diagnostic
                </h2>
                <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.8rem", color: "#94A3B8" }}>
                  Live state engine evaluating PLC signals, circuit continuity, and actionable checkpoints.
                </p>
              </div>

              {activeSession ? (
                <span
                  style={{
                    backgroundColor: "#064E3B",
                    color: "#6EE7B7",
                    border: "1px solid #059669",
                    padding: "0.3rem 0.75rem",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  ● INVESTIGATION ACTIVE
                </span>
              ) : (
                <span
                  style={{
                    backgroundColor: "#1E293B",
                    color: "#94A3B8",
                    padding: "0.3rem 0.75rem",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                  }}
                >
                  STANDBY / HEALTHY
                </span>
              )}
            </div>

            {!selectedMachineId ? (
              <div
                style={{
                  backgroundColor: "#0B0F17",
                  border: "1px dashed #334155",
                  borderRadius: "8px",
                  padding: "2rem",
                  textAlign: "center",
                  marginBottom: "1.25rem",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.9rem", color: "#94A3B8" }}>
                  Select equipment from the dropdown above to initialize or resume an investigation.
                </p>
              </div>
            ) : activeSession ? (
              <div
                style={{
                  backgroundColor: "#0B0F17",
                  border: "1px solid #1E293B",
                  borderRadius: "8px",
                  padding: "1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div style={{ marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "#FCD34D", fontWeight: 600, textTransform: "uppercase" }}>
                    Current Hypothesis:
                  </span>
                  <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.95rem", color: "#F8FAFC", lineHeight: 1.5 }}>
                    {activeSession.active_hypothesis || "Analyzing breakdown symptoms..."}
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: "0.75rem",
                    marginTop: "1rem",
                  }}
                >
                  <div style={{ backgroundColor: "#0F172A", padding: "0.75rem", borderRadius: "6px", border: "1px solid #1E293B" }}>
                    <span style={{ fontSize: "0.75rem", color: "#38BDF8", display: "block" }}>Open Tasks</span>
                    <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#F8FAFC" }}>
                      {activeSession.pending_tasks?.length || 0}
                    </span>
                  </div>
                  <div style={{ backgroundColor: "#0F172A", padding: "0.75rem", borderRadius: "6px", border: "1px solid #1E293B" }}>
                    <span style={{ fontSize: "0.75rem", color: "#34D399", display: "block" }}>Verified Signals</span>
                    <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#F8FAFC" }}>
                      {activeSession.verified_signals?.length || 0}
                    </span>
                  </div>
                  <div style={{ backgroundColor: "#0F172A", padding: "0.75rem", borderRadius: "6px", border: "1px solid #1E293B" }}>
                    <span style={{ fontSize: "0.75rem", color: "#94A3B8", display: "block" }}>Ruled Out</span>
                    <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#F8FAFC" }}>
                      {activeSession.eliminated_causes?.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: "#0B0F17",
                  border: "1px dashed #334155",
                  borderRadius: "8px",
                  padding: "1.75rem",
                  textAlign: "center",
                  marginBottom: "1.25rem",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.9rem", color: "#94A3B8" }}>
                  No active breakdown reported for this unit. Schematics and logic tables are indexed and ready.
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={!selectedMachineId}
              onClick={() => {
                setSelectedSessionId(activeSession?.id || null);
                setShowWorkspace(true);
              }}
              style={{
                width: "100%",
                backgroundColor: !selectedMachineId ? "#1E293B" : "#2563EB",
                color: !selectedMachineId ? "#64748B" : "#FFFFFF",
                border: "none",
                padding: "0.85rem",
                borderRadius: "6px",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: !selectedMachineId ? "not-allowed" : "pointer",
                transition: "background-color 0.2s",
              }}
            >
              {activeSession
                ? "⚡ Resume Live Diagnostic Workspace"
                : "⚡ Start New Diagnostic Investigation"}
            </button>
          </div>
        </main>

        {/* Right Sidebar: Incident Logs & History */}
        <aside
          style={{
            backgroundColor: "#0F172A",
            border: "1px solid #1E293B",
            borderRadius: "8px",
            padding: "1.5rem",
            height: "fit-content",
          }}
        >
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: "#F8FAFC",
              marginTop: 0,
              marginBottom: "1rem",
              borderBottom: "1px solid #1E293B",
              paddingBottom: "0.5rem",
            }}
          >
            📋 Incident Audit Trail
          </h3>

          {!selectedMachineId ? (
            <p style={{ color: "#64748B", fontSize: "0.85rem", margin: 0 }}>
              Select a machine to review logged incidents.
            </p>
          ) : pastSessions.length === 0 ? (
            <p style={{ color: "#64748B", fontSize: "0.85rem", margin: 0 }}>
              No past incidents recorded for this machine.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {pastSessions.map((sessionItem) => (
                <div
                  key={sessionItem.id}
                  onClick={() => {
                    setSelectedSessionId(sessionItem.id);
                    setShowWorkspace(true);
                  }}
                  style={{
                    backgroundColor: "#0B0F17",
                    border: "1px solid #1E293B",
                    borderRadius: "6px",
                    padding: "0.75rem",
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#38BDF8")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1E293B")}
                >
                  <p
                    style={{
                      fontSize: "0.825rem",
                      fontWeight: 600,
                      color: "#E2E8F0",
                      margin: "0 0 0.35rem 0",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "start",
                    }}
                  >
                    {sessionItem.title || "Investigation Log"}
                  </p>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#94A3B8",
                      margin: "0 0 0.5rem 0",
                      lineHeight: 1.3,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {sessionItem.active_hypothesis || "Resolved"}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.7rem",
                      color: "#64748B",
                    }}
                  >
                    <span style={{ color: sessionItem.status === "resolved" ? "#34D399" : "#FCD34D" }}>
                      {sessionItem.status.toUpperCase()}
                    </span>
                    <span>{new Date(sessionItem.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Responsive Manage Files Modal */}
      {showManageModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowManageModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 999,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#0F172A",
              border: "1px solid #1E293B",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "640px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid #1E293B",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#F8FAFC" }}>
                  {t("machineFilesTitle") || "Machine Documentation"}
                </h3>
                <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
                  {documents.length} files • {formatBytes(totalBytes)}
                </span>
              </div>
              <button
                onClick={() => setShowManageModal(false)}
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  color: "#94A3B8",
                  fontSize: "1.25rem",
                  cursor: "pointer",
                  padding: "0.25rem 0.5rem",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable File List */}
            <div
              style={{
                padding: "1rem 1.5rem",
                overflowY: "auto",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {documents.length === 0 ? (
                <p style={{ color: "#64748B", fontSize: "0.85rem", textAlign: "center", margin: "2rem 0" }}>
                  {t("noFilesAttached") || "No documents uploaded for this machine."}
                </p>
              ) : (
                documents.map((doc) => {
                  const status = doc.ocr_status || "pending";
                  const isCompleted = status === "completed";
                  const isProcessing = status === "processing";

                  return (
                    <div
                      key={doc.id}
                      style={{
                        backgroundColor: "#0B0F17",
                        border: "1px solid #1E293B",
                        borderRadius: "6px",
                        padding: "0.75rem 1rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: "0.85rem",
                              color: "#E2E8F0",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={doc.file_name}
                          >
                            📄 {doc.file_name}
                          </p>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                              backgroundColor: isCompleted ? "#064E3B" : isProcessing ? "#78350F" : "#1E293B",
                              color: isCompleted ? "#6EE7B7" : isProcessing ? "#FCD34D" : "#94A3B8",
                              fontWeight: 500,
                              textTransform: "uppercase",
                            }}
                          >
                            {isCompleted ? "indexed" : isProcessing ? "indexing..." : "pending"}
                          </span>
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                          {formatBytes(doc.file_size_bytes)}
                        </span>
                      </div>

                      <button
                        onClick={() => handleDeleteFile(doc)}
                        disabled={deletingId === doc.id}
                        style={{
                          backgroundColor: "#7F1D1D",
                          color: "#FECACA",
                          border: "1px solid #991B1B",
                          padding: "0.3rem 0.7rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          cursor: deletingId === doc.id ? "not-allowed" : "pointer",
                          opacity: deletingId === doc.id ? 0.6 : 1,
                          flexShrink: 0,
                        }}
                      >
                        {deletingId === doc.id ? (t("deleting") || "Deleting...") : (t("delete") || "Delete")}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "1rem 1.5rem",
                borderTop: "1px solid #1E293B",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowManageModal(false)}
                style={{
                  backgroundColor: "#1E293B",
                  color: "#F8FAFC",
                  border: "1px solid #334155",
                  padding: "0.5rem 1.25rem",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                {t("close") || "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Diagnostic Workspace Modal */}
      <DiagnosticWorkspaceModal
        isOpen={showWorkspace}
        onClose={() => {
          setShowWorkspace(false);
          setSelectedSessionId(null);
        }}
        machineId={selectedMachineId}
        sessionId={selectedSessionId}
        machineName={machines.find((m) => m.id === selectedMachineId)?.name}
      />
    </div>
  );
}
