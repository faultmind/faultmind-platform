"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Page() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("login"); // 'login' | 'signup'
  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // 1. Initialize Paddle Sandbox & Listen for Supabase Auth
  useEffect(() => {
    if (typeof window !== "undefined" && window.Paddle) {
      window.Paddle.Environment.set("sandbox");
      window.Paddle.Initialize({
        token: "test_bd750c6afa2b96f46915dc54854", // keep your test_... token here
      });
    }

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // 2. Auth Actions
  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg("");

    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setStatusMsg("Account created! Check your email to confirm registration.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setStatusMsg("Logged in successfully.");
      }
    } catch (err) {
      setStatusMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // 3. Paddle Checkout (passes Supabase User ID into custom_data)
  const handleCheckout = () => {
    if (typeof window !== "undefined" && window.Paddle) {
      window.Paddle.Checkout.open({
        items: [{ priceId: "pri_01m318yt98g9rfjwn8tmspze9h", quantity: 1 }], // your pri_... ID
        customer: user ? { email: user.email } : undefined,
        customData: user ? { userId: user.id } : {},
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
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          border: "1px solid #1E293B",
          borderRadius: "16px",
          padding: "2.5rem 2rem",
          backgroundColor: "#0F172A",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#D9FF00",
              backgroundColor: "rgba(217, 255, 0, 0.1)",
              padding: "4px 10px",
              borderRadius: "9999px",
              border: "1px solid rgba(217, 255, 0, 0.25)",
            }}
          >
            FaultMind Engineering Core
          </span>
          <h1 style={{ fontSize: "2rem", marginTop: "1rem" }}>FaultMind Pro</h1>
          <p style={{ color: "#94A3B8", fontSize: "0.95rem" }}>
            Multi-tenant industrial diagnostics & root-cause analysis
          </p>
        </div>

        {/* User Session State */}
        {user ? (
          <div
            style={{
              backgroundColor: "#1E293B",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1.5rem",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "0.85rem", color: "#94A3B8", margin: 0 }}>
              Connected as:
            </p>
            <p style={{ fontWeight: 600, margin: "4px 0 12px 0" }}>
              {user.email}
            </p>
            <button
              onClick={handleSignOut}
              style={{
                background: "transparent",
                border: "1px solid #475569",
                color: "#CBD5E1",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <form onSubmit={handleAuth} style={{ marginBottom: "2rem" }}>
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: "#94A3B8",
                  marginBottom: "4px",
                }}
              >
                Work Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="engineer@plant.com"
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid #334155",
                  backgroundColor: "#0B0F19",
                  color: "#F8FAFC",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: "#94A3B8",
                  marginBottom: "4px",
                }}
              >
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid #334155",
                  backgroundColor: "#0B0F19",
                  color: "#F8FAFC",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "6px",
                backgroundColor: "#334155",
                color: "#F8FAFC",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: "0.5rem",
              }}
            >
              {loading
                ? "Processing..."
                : authMode === "signup"
                ? "Create Account"
                : "Sign In"}
            </button>

            <div style={{ textAlign: "center" }}>
              <button
                type="button"
                onClick={() =>
                  setAuthMode(authMode === "login" ? "signup" : "login")
                }
                style={{
                  background: "none",
                  border: "none",
                  color: "#94A3B8",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {authMode === "login"
                  ? "Need an account? Sign up"
                  : "Already registered? Sign in"}
              </button>
            </div>
          </form>
        )}

        {statusMsg && (
          <p
            style={{
              fontSize: "0.85rem",
              color: statusMsg.includes("Check your email") || statusMsg.includes("successfully")
                ? "#4ADE80"
                : "#F87171",
              textAlign: "center",
              marginBottom: "1rem",
            }}
          >
            {statusMsg}
          </p>
        )}

        {/* Subscription / Plan Box */}
        <div
          style={{
            borderTop: "1px solid #1E293B",
            paddingTop: "1.5rem",
            textAlign: "center",
          }}
        >
          <div style={{ margin: "1rem 0" }}>
            <span style={{ fontSize: "2.25rem", fontWeight: 800 }}>$15</span>
            <span style={{ color: "#94A3B8", fontSize: "0.95rem" }}> / month</span>
          </div>

          <button
            onClick={handleCheckout}
            style={{
              backgroundColor: "#D9FF00",
              color: "#0F172A",
              padding: "12px 24px",
              fontSize: "0.95rem",
              fontWeight: 700,
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Subscribe to FaultMind Pro
          </button>
        </div>
      </div>
    </main>
  );
}
