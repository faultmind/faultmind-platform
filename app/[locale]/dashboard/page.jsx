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
  const [faultQuery, setFaultQuery] = useState("");

  // Machine management state
  const [machines, setMachines] = useState([]);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [newMachineName, setNewMachineName] = useState("");
  const [newMachineModel, setNewMachineModel] = useState("");
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Diagnostic execution & logs
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [historyLogs, setHistoryLogs] = useState([]);

  const [showManageModal, setShowManageModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [showWorkspace, setShowWorkspace] = useState(false);

  // Delete a document from both Storage and Database
  const handleDeleteFile = async (doc) => {
    if (!window.confirm(t("confirmDelete") || "Are you sure you want to delete this file?")) {
      return;
    }

    setDeletingId(doc.id);
    setErrorMsg("");

    try {
      // 1. Remove binary file from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from("machine-docs")
        .remove([doc.file_path]);

      if (storageError) {
        console.warn("Storage deletion warning:", storageError.message);
      }

      // 2. Delete row from machine_documents table
      const { error: dbError } = await supabase
        .from("machine_documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) throw dbError;

      // 3. Update local state
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      console.error("Delete Error:", err);
      alert(err.message || "Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  };

  // Computed variable (MUST BE BELOW `documents` declaration)
  const totalBytes = (documents || []).reduce(
    (acc, doc) => acc + (Number(doc?.file_size_bytes) || 0),
    0
  );

  useEffect(() => {
    async function initDashboard() {
      setLoading(true);

      // 1. Check active user session
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.replace(`/${locale}`);
        return;
      }

      // 2. Check active subscription
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
      await fetchHistory(currentUser.id);
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

  // Load past diagnostic history logs
  async function fetchHistory(userId) {
    const { data } = await supabase
      .from("diagnostic_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    setHistoryLogs(data || []);
  }

// Fetch documents and listen for live Realtime updates
  useEffect(() => {
    if (!selectedMachineId) {
      setDocuments([]);
      return;
    }

    // 1. Initial fetch of documents for the selected machine
    async function loadDocs() {
      const { data } = await supabase
        .from("machine_documents")
        .select("*")
        .eq("machine_id", selectedMachineId)
        .order("created_at", { ascending: false });
      setDocuments(data || []);
    }

    loadDocs();

    // 2. Realtime WebSocket subscription for instant status synchronization
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
          // Flip status (e.g. pending -> processing -> completed) live
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

    // 3. Clean teardown when switching machines or unmounting
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedMachineId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace(`/${locale}`);
  };

  // Add new machine record with explicit error handling
  const handleCreateMachine = async (e) => {
    e.preventDefault();
    if (!newMachineName.trim()) return;

    setErrorMsg("");

    try {
      const activeUser = user || (await supabase.auth.getUser()).data?.user;
      if (!activeUser) {
        throw new Error("User session expired. Please sign in again.");
      }

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

      if (error) {
        throw error;
      }

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

  // Upload multiple files directly to Supabase Storage, record in DB, & trigger background OCR ingestion
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

        // 1. Upload file binary to Storage bucket
        const { error: uploadError } = await supabase.storage
          .from("machine-docs")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Insert record in machine_documents
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

        // 3. Asynchronously trigger background ingestion worker if token available
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
                // Update local document status to completed
                setDocuments((currentDocs) =>
                  currentDocs.map((d) =>
                    d.id === docData.id ? { ...d, ocr_status: "completed" } : d
                  )
                );
              }
            })
            .catch((e) => console.warn("Background ingestion failed to trigger:", e.message));
        }
      }

      // Update state with newly attached files
      setDocuments((prev) => [...uploadedDocs, ...prev]);
    } catch (err) {
      console.error("Upload failure:", err);
      setErrorMsg(err.message || "Failed to upload one or more files");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Execute diagnostic API call
  const handleDiagnose = async () => {
    if (!faultQuery.trim()) return;
    setAnalyzing(true);
    setErrorMsg("");
    setResult(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          faultQuery,
          locale,
          machineId: selectedMachineId || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Analysis failed");

      setResult(resData.data);
      await fetchHistory(user.id);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Reload previous log from history
  const handleSelectHistoryItem = (item) => {
    setResult({
      direction: item.direction,
      mainTitle: item.main_title,
      sectionOneTitle: item.section_one_title,
      sectionTwoTitle: item.section_two_title,
      sectionOneItems: item.section_one_items || [],
      sectionTwoItems: item.section_two_items || [],
    });
    setFaultQuery(item.query_text);
    if (item.machine_id) setSelectedMachineId(item.machine_id);
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
            {t("title")}
          </h1>
          <p
            style={{
              color: "#94A3B8",
              fontSize: "0.875rem",
              margin: "0.25rem 0 0 0",
            }}
          >
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

      {/* Main Grid Layout: Diagnostics + History Sidebar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: "2rem",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        {/* Left Column: Diagnostics Workspace */}
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
                {t("selectMachine") || "Select Machine (Optional)"}
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
                  {t("noMachine") || "-- General Diagnostic (No Machine) --"}
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

            {selectedMachineId && (
  <button
    type="button"
    onClick={() => setShowWorkspace(true)}
    style={{
      backgroundColor: "#065F46",
      color: "#A7F3D0",
      border: "1px solid #059669",
      padding: "0.5rem 1rem",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "0.85rem",
      fontWeight: 600,
      marginTop: "1.2rem",
    }}
  >
    ⚡ Launch Diagnostic Workspace
  </button>
)}
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
                  {t("filesAttached") || "Attached Documents:"} {documents.length} ({formatBytes(totalBytes)})
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
                {uploading
                  ? t("uploading") || "Uploading & Indexing..."
                  : t("uploadDoc") || "Attach Manual / Schematic"}
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

          {/* Fault Input Card */}
          <div
            style={{
              backgroundColor: "#0F172A",
              border: "1px solid #1E293B",
              borderRadius: "8px",
              padding: "1.5rem",
            }}
          >
            <div style={{ marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>
                {t("subtitle")}
              </h2>
            </div>

            <textarea
              rows={6}
              dir={faultQuery.trim().length > 0 ? "auto" : locale === "ar" ? "rtl" : "ltr"}
              value={faultQuery}
              onChange={(e) => setFaultQuery(e.target.value)}
              placeholder={t("inputPlaceholder")}
              style={{
                width: "100%",
                backgroundColor: "#0B0F17",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#F8FAFC",
                padding: "1rem",
                fontSize: "0.95rem",
                resize: "vertical",
                boxSizing: "border-box",
                textAlign: "start",
              }}
            />

            <div
              style={{
                marginTop: "1rem",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={handleDiagnose}
                disabled={!faultQuery.trim() || analyzing}
                style={{
                  backgroundColor: "#2563EB",
                  color: "#FFFFFF",
                  border: "none",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "6px",
                  fontWeight: 600,
                  cursor: faultQuery.trim() && !analyzing ? "pointer" : "not-allowed",
                  opacity: faultQuery.trim() && !analyzing ? 1 : 0.5,
                }}
              >
                {analyzing ? t("analyzing") || "Analyzing..." : t("analyzeBtn")}
              </button>
            </div>

            {/* Error Message Display */}
            {errorMsg && (
              <p
                dir="auto"
                style={{
                  color: "#EF4444",
                  marginTop: "1rem",
                  fontSize: "0.9rem",
                  textAlign: "start",
                }}
              >
                {errorMsg}
              </p>
            )}

            {/* Diagnostic Results Presentation */}
            {result && (
              <div
                dir={result.direction || "ltr"}
                style={{
                  marginTop: "2rem",
                  backgroundColor: "#0B0F17",
                  border: "1px solid #1E293B",
                  borderRadius: "6px",
                  padding: "1.5rem",
                  textAlign: "start",
                }}
              >
                <h3 style={{ color: "#38BDF8", marginTop: 0 }}>
                  {result.mainTitle || "Diagnostic Findings"}
                </h3>

                {result.sectionOneItems?.length > 0 && (
                  <>
                    <h4 style={{ color: "#F8FAFC", marginBottom: "0.5rem" }}>
                      {result.sectionOneTitle}:
                    </h4>
                    <ul
                      style={{
                        color: "#CBD5E1",
                        lineHeight: 1.8,
                        paddingInlineStart: "1.5rem",
                        margin: 0,
                      }}
                    >
                      {result.sectionOneItems.map((item, idx) => (
                        <li key={idx} style={{ marginBottom: "0.35rem" }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {result.sectionTwoItems?.length > 0 && (
                  <>
                    <h4
                      style={{
                        color: "#F8FAFC",
                        marginBottom: "0.5rem",
                        marginTop: "1.5rem",
                      }}
                    >
                      {result.sectionTwoTitle}:
                    </h4>
                    <ol
                      style={{
                        color: "#CBD5E1",
                        lineHeight: 1.8,
                        paddingInlineStart: "1.5rem",
                        margin: 0,
                      }}
                    >
                      {result.sectionTwoItems.map((step, idx) => (
                        <li key={idx} style={{ marginBottom: "0.35rem" }}>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar: Recent Diagnostic Logs */}
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
            {t("recentHistory") || "Diagnostic Log History"}
          </h3>

          {historyLogs.length === 0 ? (
            <p style={{ color: "#64748B", fontSize: "0.85rem", margin: 0 }}>
              {t("noHistory") || "No saved diagnostics yet."}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {historyLogs.map((log) => (
                <div
                  key={log.id}
                  onClick={() => handleSelectHistoryItem(log)}
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
                    dir={log.direction || "ltr"}
                    style={{
                      fontSize: "0.825rem",
                      color: "#E2E8F0",
                      margin: "0 0 0.4rem 0",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "start",
                    }}
                  >
                    {log.query_text}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.7rem",
                      color: "#64748B",
                    }}
                  >
                    <span>{log.main_title || "Diagnosis"}</span>
                    <span>{new Date(log.created_at).toLocaleDateString()}</span>
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
      {/* Diagnostic Workspace Modal */}
      <DiagnosticWorkspaceModal
        isOpen={showWorkspace}
        onClose={() => setShowWorkspace(false)}
        machineId={selectedMachineId}
        machineName={machines.find((m) => m.id === selectedMachineId)?.name}
      />
    </div>
  );
}
