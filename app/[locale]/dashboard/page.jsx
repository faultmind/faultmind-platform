"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { supabase } from "../../../lib/supabaseClient";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [faultQuery, setFaultQuery] = useState("");

  // States for diagnostic execution
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function checkAccess() {
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
      setLoading(false);
    }

    checkAccess();
  }, [locale, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace(`/${locale}`);
  };

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
        body: JSON.stringify({ faultQuery, locale }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Analysis failed");

      setResult(resData.data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setAnalyzing(false);
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
        <p>Loading diagnostics workspace...</p>
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
          maxWidth: "1100px",
          margin: "0 auto 3rem auto",
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
      const isArabic = (text) => /[\u0600-\u06FF]/.test(text || "");
      {/* Main Diagnostics Workspace */}
      <main style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            {t("subtitle")}
          </h2>
        </div>

        <div
          style={{
            backgroundColor: "#0F172A",
            border: "1px solid #1E293B",
            borderRadius: "8px",
            padding: "1.5rem",
          }}
        >

          <textarea
  rows={6}
  dir="auto"
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
              {analyzing ? "Analyzing..." : t("analyzeBtn")}
            </button>
          </div>

          {/* Error Message Display */}
          {errorMsg && (
            <p
              style={{
                color: "#EF4444",
                marginTop: "1rem",
                fontSize: "0.9rem",
              }}
            >
              {errorMsg}
            </p>
          )}

          {/* Diagnostic Results Presentation */}
          {result && (
            <div
              style={{
                marginTop: "2rem",
                backgroundColor: "#0B0F17",
                border: "1px solid #1E293B",
                borderRadius: "6px",
                padding: "1.5rem",
              }}
            >
              <h3 style={{ color: "#38BDF8", marginTop: 0 }}>
                Diagnostic Findings
              </h3>

              <h4 style={{ color: "#F8FAFC", marginBottom: "0.5rem" }}>
                Probable Root Causes:
              </h4>
              <ul style={{ color: "#CBD5E1", lineHeight: 1.6 }}>
                {result.probableRootCauses.map((cause, idx) => (
                  <li key={idx}>{cause}</li>
                ))}
              </ul>

              <h4
                style={{
                  color: "#F8FAFC",
                  marginBottom: "0.5rem",
                  marginTop: "1.25rem",
                }}
              >
                Recommended Action Steps:
              </h4>
              <ol style={{ color: "#CBD5E1", lineHeight: 1.6 }}>
                {result.recommendedActionSteps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
