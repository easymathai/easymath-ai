"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import SiteFooter from "../site-footer";
import BrandLogo from "../brand-logo";

type Stage = "checking" | "ready" | "invalid" | "saving" | "done" | "unavailable";

const MIN_PASSWORD_LENGTH = 6;

function readLinkError(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const description =
    hash.get("error_description") || query.get("error_description");
  const code = hash.get("error_code") || query.get("error_code");

  if (!description && !code) {
    return null;
  }

  if (code === "otp_expired" || /expired/i.test(description || "")) {
    return "This reset link has expired or was already used. Please request a new one.";
  }

  return "This reset link isn't valid. Please request a new one.";
}

export default function ResetPasswordPage() {
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      const timer = window.setTimeout(() => setStage("unavailable"), 0);
      return () => window.clearTimeout(timer);
    }

    let active = true;
    const linkError = readLinkError();

    // The Supabase client (detectSessionInUrl) exchanges the recovery link
    // for a temporary session and emits PASSWORD_RECOVERY.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        setStage((current) => (current === "done" ? current : "ready"));
        setMessage("");
      }
    });

    async function check() {
      const { data } = await supabase!.auth.getSession();

      if (!active) return;

      if (data.session) {
        setStage((current) => (current === "checking" ? "ready" : current));
        return;
      }

      // Give the client a moment to finish exchanging the link.
      window.setTimeout(async () => {
        if (!active) return;
        const again = await supabase!.auth.getSession();
        if (!active) return;

        if (again.data.session) {
          setStage((current) => (current === "checking" ? "ready" : current));
        } else {
          setStage((current) => (current === "checking" ? "invalid" : current));
          setMessage(
            linkError ||
              "Open the reset link from your email on this device to choose a new password."
          );
        }
      }, 1500);
    }

    void check();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase || stage === "saving") {
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(`Please use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirm) {
      setMessage("The two passwords don't match.");
      return;
    }

    setStage("saving");
    setMessage("");

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const lower = error.message.toLowerCase();
        setStage("ready");
        setMessage(
          lower.includes("different from the old")
            ? "Please choose a password you haven't used before."
            : lower.includes("session") || lower.includes("jwt")
              ? "This reset link has expired. Please request a new one."
              : lower.includes("weak") || lower.includes("password should")
                ? "That password is too weak. Try a longer one."
                : "We couldn't update your password. Please try again."
        );
        return;
      }

      setPassword("");
      setConfirm("");
      setStage("done");
    } catch {
      setStage("ready");
      setMessage("Unable to reach the account service. Please try again.");
    }
  }

  const inputStyle = {
    width: "100%",
    marginTop: "8px",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #334155",
    background: "#0b1220",
    color: "#e5e7eb",
    fontWeight: 600,
    boxSizing: "border-box" as const,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #1e3a8a 0%, transparent 28%), radial-gradient(circle at bottom right, #14532d 0%, transparent 28%), #0f172a",
        color: "#e5e7eb",
        padding: "22px 16px 36px",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div style={{ maxWidth: "460px", margin: "0 auto" }}>
        <header style={{ marginBottom: "20px" }}>
          <Link
            href="/"
            aria-label="EasyMath Ai home"
            style={{
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            <BrandLogo variant="dark" />
          </Link>
        </header>

        <section
          style={{
            background: "rgba(15,23,42,0.94)",
            border: "1px solid #334155",
            borderRadius: "22px",
            padding: "24px 22px",
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: "24px", fontWeight: 900 }}>
            Reset your password
          </h1>

          {stage === "checking" && (
            <p style={{ color: "#94a3b8", fontWeight: 600 }}>Checking your reset link…</p>
          )}

          {stage === "unavailable" && (
            <p style={{ color: "#cbd5e1" }}>
              Accounts aren&apos;t available right now. Please try again later.
            </p>
          )}

          {stage === "invalid" && (
            <p style={{ color: "#cbd5e1" }}>
              {message} You can request a new link from <strong>Log in → Forgot password?</strong>{" "}
              on the <Link href="/" style={{ color: "#93c5fd" }}>home page</Link>.
            </p>
          )}

          {(stage === "ready" || stage === "saving") && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              <p style={{ color: "#94a3b8", fontWeight: 600, fontSize: "14px" }}>
                Choose a new password for your EasyMath account.
              </p>
              <label style={{ display: "block", marginTop: "14px", fontWeight: 800, fontSize: "13px" }}>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "block", marginTop: "14px", fontWeight: 800, fontSize: "13px" }}>
                Confirm new password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={inputStyle}
                />
              </label>

              {message && (
                <div
                  role="alert"
                  style={{
                    marginTop: "14px",
                    padding: "12px 13px",
                    borderRadius: "12px",
                    background: "#422006",
                    border: "1px solid #f59e0b",
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={stage === "saving"}
                style={{
                  width: "100%",
                  marginTop: "16px",
                  border: "none",
                  background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                  color: "white",
                  padding: "13px 16px",
                  borderRadius: "12px",
                  fontWeight: 900,
                  cursor: stage === "saving" ? "wait" : "pointer",
                }}
              >
                {stage === "saving" ? "Saving…" : "Save new password"}
              </button>
            </form>
          )}

          {stage === "done" && (
            <div>
              <p style={{ color: "#cbd5e1" }}>
                Your password has been updated and you&apos;re signed in.
              </p>
              <Link
                href="/"
                style={{
                  display: "inline-block",
                  marginTop: "8px",
                  background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                  color: "white",
                  padding: "11px 16px",
                  borderRadius: "12px",
                  fontWeight: 900,
                  textDecoration: "none",
                }}
              >
                Back to EasyMath
              </Link>
            </div>
          )}
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
