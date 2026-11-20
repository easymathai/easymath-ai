"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getOwnerSupabaseBrowserClient } from "@/lib/supabase/owner-client";

function resetRedirectUrl(): string {
  if (typeof window === "undefined") {
    return "https://easymathai.com/reset-password";
  }

  const host = window.location.hostname;

  if (host === "localhost" || host === "127.0.0.1") {
    return `${window.location.origin}/reset-password`;
  }

  return "https://easymathai.com/reset-password";
}

export default function OwnerLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setResetSent(false);

    const supabase = getOwnerSupabaseBrowserClient();

    if (!supabase) {
      setMessage("Sign-in is temporarily unavailable. Please try again later.");
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.session?.access_token) {
        await supabase.auth.signOut();
        setMessage("Couldn't sign in with those details.");
        return;
      }

      const response = await fetch("/api/owner/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });

      if (!response.ok) {
        await supabase.auth.signOut();
        setMessage("Access denied.");
        return;
      }

      router.push("/owner");
      router.refresh();
    } catch {
      setMessage("Couldn't sign in right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setMessage(null);
    setResetSent(false);

    const trimmed = email.trim();

    if (!trimmed || !trimmed.includes("@")) {
      setMessage("Enter your account email above, then try Forgot password? again.");
      return;
    }

    const supabase = getOwnerSupabaseBrowserClient();

    if (!supabase) {
      setMessage("Password reset is temporarily unavailable. Please try again later.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: resetRedirectUrl(),
      });

      if (error) {
        const lower = error.message.toLowerCase();

        if (lower.includes("rate") || lower.includes("too many") || lower.includes("seconds")) {
          setMessage("Too many reset requests. Please wait a minute and try again.");
          return;
        }

        setMessage("We couldn't send a reset email right now. Please try again.");
        return;
      }

      setResetSent(true);
      setMessage("If that email has an account, we sent a reset link. It opens on easymathai.com.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#080d18",
        color: "#e5e7eb",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 20,
          padding: "32px 28px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#a78bfa",
            fontWeight: 700,
          }}
        >
          EasyMath AI
        </p>
        <h1 style={{ margin: "10px 0 0", fontSize: 28, fontWeight: 800, color: "white" }}>
          Owner console
        </h1>
        <p style={{ margin: "10px 0 0", color: "#94a3b8", fontSize: 14, lineHeight: 1.5 }}>
          Sign in with an authorized account. This console is separate from the public EasyMath site.
        </p>

        <form onSubmit={(event) => void handleSubmit(event)} style={{ marginTop: 24, display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={{
                width: "100%",
                border: "1px solid #334155",
                background: "#0b1220",
                color: "#e5e7eb",
                padding: "11px 12px",
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 14,
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{
                width: "100%",
                border: "1px solid #334155",
                background: "#0b1220",
                color: "#e5e7eb",
                padding: "11px 12px",
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 14,
              }}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            style={{
              border: "none",
              background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
              color: "white",
              padding: "12px 16px",
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 15,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.8 : 1,
            }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleForgotPassword()}
            style={{
              border: "none",
              background: "transparent",
              color: "#c4b5fd",
              fontWeight: 700,
              fontSize: 13,
              cursor: busy ? "wait" : "pointer",
              textAlign: "left",
              padding: 0,
            }}
          >
            Forgot password?
          </button>
          {message ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 600,
                color: resetSent ? "#86efac" : "#fda4af",
              }}
            >
              {message}
            </p>
          ) : null}
        </form>
      </div>

      <p
        style={{
          marginTop: 28,
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "#94a3b8",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span>by</span>
        <Image
          src="/branding/zayir-ai-logo-purple-dark.png"
          alt="zayir.ai"
          width={28}
          height={28}
        />
      </p>
    </main>
  );
}
