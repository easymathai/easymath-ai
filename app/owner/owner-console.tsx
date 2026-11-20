"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { authHeaders } from "@/lib/client-auth";

type OwnerUser = {
  email: string;
  plan: "free" | "pro";
  storedPlan: "free" | "pro";
  planExpiresAt: string | null;
  expired: boolean;
  confirmed: boolean;
  lastSignInAt: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatExpiry(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function planSummary(user: OwnerUser): string {
  if (user.expired) {
    return "Free (Pro expired)";
  }

  if (user.plan === "pro") {
    return user.planExpiresAt ? `Pro until ${formatExpiry(user.planExpiresAt)}` : "Pro";
  }

  return "Free";
}

const fieldStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #334155",
  background: "#0b1220",
  color: "#e5e7eb",
  padding: "11px 12px",
  borderRadius: "12px",
  fontWeight: 600,
  fontSize: "14px",
};

const primaryButton: CSSProperties = {
  border: "none",
  background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
  color: "white",
  padding: "11px 16px",
  borderRadius: "12px",
  fontWeight: 800,
  cursor: "pointer",
};

const softButton: CSSProperties = {
  border: "1px solid #334155",
  background: "#1e293b",
  color: "#e5e7eb",
  padding: "8px 12px",
  borderRadius: "10px",
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
};

export default function OwnerConsole() {
  const [users, setUsers] = useState<OwnerUser[]>([]);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadUsers = useCallback(async (search?: string) => {
    setError("");
    const headers = await authHeaders();
    const params = new URLSearchParams();
    const q = (search ?? query).trim();

    if (q) {
      params.set("q", q);
    }

    const response = await fetch(`/api/owner/users${params.toString() ? `?${params}` : ""}`, {
      headers,
    });

    if (response.status === 404) {
      window.location.replace("/owner");
      return;
    }

    if (!response.ok) {
      setError("Unable to load users right now.");
      setUsers([]);
      return;
    }

    const json = (await response.json()) as { users?: OwnerUser[] };
    setUsers(Array.isArray(json.users) ? json.users : []);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      await loadUsers("");
      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Load once on mount. Search is applied from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return users;
    }

    return users.filter((user) => user.email.toLowerCase().includes(q));
  }, [query, users]);

  async function updatePlan(targetEmail: string, plan: "free" | "pro", expiry?: string) {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const headers = await authHeaders({ "Content-Type": "application/json" });
      const response = await fetch("/api/owner/plan", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: targetEmail,
          plan,
          expiresAt: plan === "pro" && expiry ? expiry : null,
        }),
      });

      const json = (await response.json().catch(() => ({}))) as { error?: string };

      if (response.status === 404 && json.error === "Not found.") {
        window.location.replace("/owner");
        return;
      }

      if (!response.ok) {
        setError(json.error || "Unable to update that plan right now.");
        return;
      }

      setMessage(
        plan === "pro"
          ? `Pro granted to ${targetEmail}.`
          : `Pro revoked for ${targetEmail}.`
      );
      await loadUsers("");
    } finally {
      setBusy(false);
    }
  }

  async function handleGrant(event: FormEvent) {
    event.preventDefault();

    const target = email.trim();

    if (!target) {
      setError("Enter the email of an existing account.");
      return;
    }

    await updatePlan(target, "pro", expiresAt.trim());
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #1e3a8a 0%, transparent 28%), radial-gradient(circle at bottom right, #4c1d95 0%, transparent 28%), #0f172a",
        color: "#e5e7eb",
        padding: "22px 16px 36px",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        letterSpacing: "-0.011em",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <header
          style={{
            background: "rgba(15,23,42,0.94)",
            border: "1px solid #334155",
            borderRadius: "22px",
            padding: "18px 20px",
            marginBottom: "18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                color: "#a78bfa",
                fontSize: "11px",
                fontWeight: 900,
                letterSpacing: "0.08em",
              }}
            >
              EASYMATH AI
            </div>
            <div
              style={{
                marginTop: "4px",
                fontWeight: 900,
                fontSize: "22px",
                letterSpacing: "-0.03em",
              }}
            >
              Owner tools
            </div>
            <div style={{ marginTop: "6px", color: "#94a3b8", fontWeight: 600, fontSize: "13px" }}>
              Grant or revoke Pro for existing accounts. No payments.
            </div>
          </div>
          <Link
            href="/"
            style={{
              border: "1px solid #334155",
              background: "#1e293b",
              color: "#e5e7eb",
              padding: "9px 14px",
              borderRadius: "999px",
              fontWeight: 800,
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            Back to EasyMath
          </Link>
        </header>

        <section
          style={{
            background: "rgba(15,23,42,0.94)",
            border: "1px solid #334155",
            borderRadius: "24px",
            padding: "22px 20px",
            marginBottom: "18px",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: "16px", marginBottom: "14px" }}>
            Grant Pro
          </div>
          <form
            onSubmit={(event) => void handleGrant(event)}
            style={{
              display: "grid",
              gap: "12px",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 0.8fr) auto",
              alignItems: "end",
            }}
            className="owner-grant-form"
          >
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ color: "#94a3b8", fontWeight: 700, fontSize: "12px" }}>
                Account email
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="student@example.com"
                style={fieldStyle}
                required
              />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ color: "#94a3b8", fontWeight: 700, fontSize: "12px" }}>
                Expiry date (optional)
              </span>
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                style={fieldStyle}
              />
            </label>
            <button type="submit" disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.7 : 1 }}>
              Grant Pro
            </button>
          </form>
          <div style={{ marginTop: "10px", color: "#94a3b8", fontSize: "13px", fontWeight: 600 }}>
            Leave the expiry blank for no end date. The date is inclusive through the end of that UTC day.
          </div>
        </section>

        <section
          style={{
            background: "rgba(15,23,42,0.94)",
            border: "1px solid #334155",
            borderRadius: "24px",
            padding: "22px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: "16px" }}>
              Users {loading ? "" : `(${visibleUsers.length})`}
            </div>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by email"
              style={{ ...fieldStyle, maxWidth: "320px" }}
            />
          </div>

          {error ? (
            <div style={{ color: "#fca5a5", fontWeight: 700, marginBottom: "12px" }}>{error}</div>
          ) : null}
          {message ? (
            <div style={{ color: "#86efac", fontWeight: 700, marginBottom: "12px" }}>{message}</div>
          ) : null}

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", color: "#94a3b8" }}>
                  {["Email", "Plan", "Pro expiry", "Confirmed", "Last sign-in", ""].map((label) => (
                    <th
                      key={label || "actions"}
                      style={{
                        padding: "10px 8px",
                        fontWeight: 800,
                        fontSize: "12px",
                        letterSpacing: "0.04em",
                        borderBottom: "1px solid #334155",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "18px 8px", color: "#94a3b8" }}>
                      Loading users…
                    </td>
                  </tr>
                ) : visibleUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "18px 8px", color: "#94a3b8" }}>
                      No users match that search.
                    </td>
                  </tr>
                ) : (
                  visibleUsers.map((user) => (
                    <tr key={user.email} style={{ borderBottom: "1px solid #1e293b" }}>
                      <td style={{ padding: "12px 8px", fontWeight: 700 }}>{user.email}</td>
                      <td style={{ padding: "12px 8px", fontWeight: 700 }}>{planSummary(user)}</td>
                      <td style={{ padding: "12px 8px", color: "#cbd5e1" }}>
                        {user.storedPlan === "pro" ? formatExpiry(user.planExpiresAt) : "—"}
                      </td>
                      <td style={{ padding: "12px 8px" }}>{user.confirmed ? "Yes" : "No"}</td>
                      <td style={{ padding: "12px 8px", color: "#cbd5e1", whiteSpace: "nowrap" }}>
                        {formatDateTime(user.lastSignInAt)}
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "right" }}>
                        {user.storedPlan === "pro" || user.plan === "pro" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void updatePlan(user.email, "free")}
                            style={softButton}
                          >
                            Revoke Pro
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEmail(user.email);
                            }}
                            style={softButton}
                          >
                            Use email
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <style>{`
        @media (max-width: 800px) {
          .owner-grant-form {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
