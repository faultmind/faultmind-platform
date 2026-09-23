"use client";
import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function Page() {
  const tHeader = useTranslations("Header");
  const tAuth = useTranslations("Auth");
  const tPricing = useTranslations("Pricing");
  
  const locale = useLocale();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
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
        token: "test_bd750c6afa2b96f46915dc54854",
      });
    }

   const checkSubscription = async (userId) => {
  console.log("Checking access for engineer ID:", userId);
  
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*") // Select all columns temporarily to see the exact data shape
    .eq("user_id", userId)
    .maybeSingle(); 
    
  console.log("Supabase Auth Response:", { data, error });
    
  if (data && data.status === "active") {
    setIsSubscribed(true);
  } else {
    setIsSubscribed(false);
  }
};

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkSubscription(session.user.id);
      }
    });

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          checkSubscription(session.user.id);
        } else {
          setIsSubscribed(false);
        }
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
    setIsSubscribed(false);
  };

  // 3. Paddle Checkout (passes Supabase User ID into custom_data)
  const handleCheckout = () => {
    // Guard clause: Prevent checkout if the user session isn't fully loaded
    if (!user || !user.id) {
      setStatusMsg("Please sign in or create an account before subscribing.");
      return;
    }

    if (typeof window !== "undefined" && window.Paddle) {
      window.Paddle.Checkout.open({
        items: [{ priceId: "pri_01m318yt98g9rfjwn8tmspze9h", quantity: 1 }],
        customer: { email: user.email },
        customData: { userId: user.id }, // Guaranteed to exist now
      });
    }
  };

  // 4. Language Switcher Handler
  const changeLanguage = (nextLocale) => {
    router.push(`/${nextLocale}`);
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
      {/* Language Switcher Bar */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "1.5rem",
          backgroundColor: "#0F172A",
          padding: "6px 16px",
          borderRadius: "9999px",
          border: "1px solid #1E293B",
        }}
      >
        <button
          onClick={() => changeLanguage("en")}
          style={{
            background: "none",
            border: "none",
            color: "#94A3B8",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          English
        </button>
        <span style={{ color: "#334155" }}>|</span>
        <button
          onClick={() => changeLanguage("ar")}
          style={{
            background: "none",
            border: "none",
            color: "#94A3B8",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          العربية
        </button>
        <span style={{ color: "#334155" }}>|</span>
        <button
          onClick={() => changeLanguage("de")}
          style={{
            background: "none",
            border: "none",
            color: "#94A3B8",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Deutsch
        </button>
      </div>

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
            {tHeader("badge")}
          </span>
          <h1 style={{ fontSize: "2rem", marginTop: "1rem" }}>
            {tHeader("title")}
          </h1>
          <p style={{ color: "#94A3B8", fontSize: "0.95rem" }}>
            {tHeader("subtitle")}
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
              {tAuth("connectedAs")}
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
              {tAuth("signOut")}
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
                {tAuth("workEmail")}
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
                {tAuth("password")}
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
                ? tAuth("processing")
                : authMode === "signup"
                ? tAuth("signUp")
                : tAuth("signIn")}
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
                  ? tAuth("needAccount")
                  : tAuth("haveAccount")}
              </button>
            </div>
          </form>
        )}

        {statusMsg && (
          <p
            style={{
              fontSize: "0.85rem",
              color:
                statusMsg.includes("Check your email") ||
                statusMsg.includes("successfully")
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
            <span style={{ fontSize: "2.25rem", fontWeight: 800 }}>
              {tPricing("price")}
            </span>
            <span style={{ color: "#94A3B8", fontSize: "0.95rem" }}>
              {tPricing("cadence")}
            </span>
          </div>

          {isSubscribed ? (
            <button
              onClick={() => router.push(`/${locale}/dashboard`)}
              style={{
                backgroundColor: "#4ADE80",
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
              Go to Dashboard
            </button>
          ) : (
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
              {tPricing("cta")}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
