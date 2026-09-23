"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { supabase } from "../../lib/supabaseClient"; // adjust path if your client is in another folder

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [faultQuery, setFaultQuery] = useState("");

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

      {/* Main Diagnostics Workspace */}
      <main style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{t("subtitle")}</h2>
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
            }}
          />

          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
            <button
              disabled={!faultQuery.trim()}
              style={{
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                border: "none",
                padding: "0.75rem 1.5rem",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: faultQuery.trim() ? "pointer" : "not-allowed",
                opacity: faultQuery.trim() ? 1 : 0.5,
              }}
            >
              {t("analyzeBtn")}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
