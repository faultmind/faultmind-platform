"use client";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const locale = useLocale();
  const router = useRouter();

  return (
    <main style={{ backgroundColor: "#0B0F19", minHeight: "100vh", color: "#F8FAFC", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Navbar */}
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "1.5rem 2rem", borderBottom: "1px solid #1E293B", alignItems: "center", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#F8FAFC", letterSpacing: "-0.02em" }}>
          FaultMind
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <button
            onClick={() => router.push(`/${locale}/login`)}
            style={{ backgroundColor: "transparent", color: "#F8FAFC", border: "none", fontSize: "0.95rem", cursor: "pointer", fontWeight: 600 }}
          >
            Sign In
          </button>
          <button
            onClick={() => router.push(`/${locale}/login`)}
            style={{ backgroundColor: "#D9FF00", color: "#0F172A", border: "none", padding: "0.5rem 1.25rem", borderRadius: "6px", cursor: "pointer", fontWeight: 700, fontSize: "0.95rem" }}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{ padding: "8rem 2rem", textAlign: "center", maxWidth: "800px", margin: "0 auto" }}>
        <span style={{ backgroundColor: "rgba(217, 255, 0, 0.1)", color: "#D9FF00", padding: "6px 16px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", border: "1px solid rgba(217, 255, 0, 0.25)", letterSpacing: "0.05em" }}>
          Industrial Diagnostics Platform
        </span>
        
        <h1 style={{ fontSize: "3.5rem", marginTop: "2rem", marginBottom: "1.5rem", lineHeight: 1.1, fontWeight: 800 }}>
          Troubleshoot Faster. <br/> Eliminate Downtime.
        </h1>
        
        <p style={{ color: "#94A3B8", fontSize: "1.2rem", marginBottom: "3rem", lineHeight: 1.6, maxWidth: "600px", margin: "0 auto 3rem auto" }}>
          AI-powered root-cause analysis and instant manual lookups for automation engineers. Connect to Siemens, Delta, and field PLCs to resolve incidents in minutes, not hours.
        </p>
        
        <button
          onClick={() => router.push(`/${locale}/login`)}
          style={{ backgroundColor: "#D9FF00", color: "#0F172A", border: "none", padding: "1rem 2.5rem", borderRadius: "8px", fontSize: "1.1rem", fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 15px -3px rgba(217, 255, 0, 0.2)" }}
        >
          Start Diagnostic Workspace
        </button>
      </section>
    </main>
  );
}