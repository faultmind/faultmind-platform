"use client";
import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.Paddle) {
      window.Paddle.Environment.set("sandbox");
      window.Paddle.Initialize({
        token: "test_bd750c6afa2b96f46915dc54854", // replace with your test_... token
      });
    }
  }, []);

  const handleCheckout = () => {
    if (typeof window !== "undefined" && window.Paddle) {
      window.Paddle.Checkout.open({
        items: [{ priceId: "pri_01m318yt98g9rfjwn8tmspze9h", quantity: 1 }], // replace with your pri_... ID
      });
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0B0F19",
        color: "#F8FAFC",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          maxWidth: "600px",
          border: "1px solid #1E293B",
          borderRadius: "16px",
          padding: "3rem 2rem",
          backgroundColor: "#0F172A",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
        }}
      >
        <span
          style={{
            fontSize: "0.85rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "#D9FF00",
            backgroundColor: "rgba(217, 255, 0, 0.1)",
            padding: "4px 12px",
            borderRadius: "9999px",
            border: "1px solid rgba(217, 255, 0, 0.3)",
          }}
        >
          Industrial Diagnostics
        </span>

        <h1 style={{ fontSize: "2.5rem", margin: "1.5rem 0 0.5rem" }}>
          FaultMind Pro
        </h1>
        <p style={{ color: "#94A3B8", fontSize: "1.1rem", marginBottom: "2rem" }}>
          AI-powered root cause analysis and technical documentation retrieval
          for electrical and automation engineers.
        </p>

        <div style={{ margin: "2rem 0" }}>
          <span style={{ fontSize: "3rem", fontWeight: "800" }}>$15</span>
          <span style={{ color: "#94A3B8", fontSize: "1.1rem" }}> / month</span>
        </div>

        <button
          onClick={handleCheckout}
          style={{
            backgroundColor: "#D9FF00",
            color: "#0F172A",
            padding: "14px 28px",
            fontSize: "1rem",
            fontWeight: "700",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            width: "100%",
            transition: "opacity 0.2s ease",
          }}
        >
          Subscribe to FaultMind Pro
        </button>

        <div
          style={{
            marginTop: "2.5rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid #1E293B",
            fontSize: "0.8rem",
            color: "#64748B",
            lineHeight: "1.6",
          }}
        >
          <p>Payments securely processed by Paddle as Merchant of Record.</p>
          <p>Cancel anytime. Subscriptions remain active until billing period ends.</p>
          <p>Support: support@faultmind.com</p>
        </div>
      </div>
    </main>
  );
}
