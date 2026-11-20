"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getOwnerSupabaseBrowserClient } from "@/lib/supabase/owner-client";

type ConsoleRole = "developer" | "owner" | "staff";

type OwnerUser = {
  email: string;
  plan: "free" | "pro";
  storedPlan: "free" | "pro";
  planExpiresAt: string | null;
  expired: boolean;
  confirmed: boolean;
  lastSignInAt: string | null;
};

type StaffMember = {
  email: string;
  role: "staff";
  addedBy: string;
  createdAt: string;
};

type ActivityEvent = {
  id: string;
  email: string;
  role: string;
  event: "sign_in" | "sign_out";
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

type DeveloperInfo = {
  appVersion: string;
  commitSha: string | null;
  commitRef: string | null;
  vercelEnv: string | null;
  supabaseProjectId: string | null;
  audits: {
    plan: Array<Record<string, unknown>>;
    staff: Array<Record<string, unknown>>;
    auth: Array<Record<string, unknown>>;
  };
};

const DUBAI_TZ = "Asia/Dubai";

function formatDubai(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return `${date.toLocaleString("en-GB", {
    timeZone: DUBAI_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  })} (Asia/Dubai)`;
}

function planSummary(user: OwnerUser): string {
  if (user.expired) {
    return `Free (Pro expired ${formatDubai(user.planExpiresAt)})`;
  }

  if (user.plan === "pro") {
    return user.planExpiresAt ? `Pro until ${formatDubai(user.planExpiresAt)}` : "Pro";
  }

  return "Free";
}

function roleLabel(role: ConsoleRole): string {
  if (role === "developer") {
    return "Developer";
  }

  if (role === "owner") {
    return "Owner";
  }

  return "Staff";
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

const secondaryButton: CSSProperties = {
  border: "1px solid #334155",
  background: "transparent",
  color: "#e5e7eb",
  padding: "11px 16px",
  borderRadius: "12px",
  fontWeight: 800,
  cursor: "pointer",
};

const cardStyle: CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 16,
  padding: 20,
};

export default function OwnerConsole() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<ConsoleRole | null>(null);
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const [lastSignOutAt, setLastSignOutAt] = useState<string | null>(null);
  const [users, setUsers] = useState<OwnerUser[]>([]);
  const [query, setQuery] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [expiry, setExpiry] = useState("");
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffMessage, setStaffMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [developer, setDeveloper] = useState<DeveloperInfo | null>(null);
  const [auditTab, setAuditTab] = useState<"plan" | "staff" | "auth">("plan");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canManageStaff = role === "owner" || role === "developer";
  const isDeveloper = role === "developer";

  const load = useCallback(async () => {
    const sessionRes = await fetch("/api/owner/session", { cache: "no-store" });

    if (!sessionRes.ok) {
      router.replace("/owner/login");
      router.refresh();
      return;
    }

    const session = (await sessionRes.json()) as {
      email: string;
      role: ConsoleRole;
      lastSignInAt: string | null;
      lastSignOutAt: string | null;
    };

    setLoadError(null);
    setEmail(session.email);
    setRole(session.role);
    setLastSignInAt(session.lastSignInAt);
    setLastSignOutAt(session.lastSignOutAt);

    const [usersRes, activityRes] = await Promise.all([
      fetch("/api/owner/users", { cache: "no-store" }),
      fetch("/api/owner/activity", { cache: "no-store" }),
    ]);

    if (usersRes.ok) {
      const data = (await usersRes.json()) as { users: OwnerUser[] };
      setUsers(data.users || []);
    } else {
      setLoadError("Unable to load users right now.");
    }

    if (activityRes.ok) {
      const data = (await activityRes.json()) as {
        lastSignInAt: string | null;
        lastSignOutAt: string | null;
        events: ActivityEvent[];
      };
      setLastSignInAt(data.lastSignInAt);
      setLastSignOutAt(data.lastSignOutAt);
      setEvents(data.events || []);
    }

    if (session.role === "owner" || session.role === "developer") {
      const staffRes = await fetch("/api/owner/staff", { cache: "no-store" });

      if (staffRes.ok) {
        const data = (await staffRes.json()) as { staff: StaffMember[] };
        setStaff(data.staff || []);
      }
    }

    if (session.role === "developer") {
      const devRes = await fetch("/api/owner/developer", { cache: "no-store" });

      if (devRes.ok) {
        setDeveloper((await devRes.json()) as DeveloperInfo);
      }
    }
  }, [router]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return users;
    }

    return users.filter((user) => user.email.toLowerCase().includes(q));
  }, [query, users]);

  async function updatePlan(plan: "free" | "pro") {
    setPlanMessage(null);
    const emailValue = targetEmail.trim().toLowerCase();

    if (!emailValue) {
      setPlanMessage("Enter the account email first.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/owner/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailValue,
          plan,
          expiresAt: plan === "pro" ? expiry : null,
        }),
      });
      const data = (await response.json()) as { error?: string; email?: string };

      if (!response.ok) {
        setPlanMessage(data.error || "Unable to update that plan right now.");
        return;
      }

      setPlanMessage(
        plan === "pro"
          ? `Pro granted to ${data.email || emailValue}.`
          : `Pro revoked for ${data.email || emailValue}.`
      );
      setTargetEmail("");
      setExpiry("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addStaff(event: FormEvent) {
    event.preventDefault();
    setStaffMessage(null);
    const value = staffEmail.trim().toLowerCase();

    if (!value) {
      setStaffMessage("Enter a staff email.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/owner/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStaffMessage(data.error || "Unable to add staff right now.");
        return;
      }

      setStaffMessage(`Added ${value} as staff.`);
      setStaffEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeStaff(memberEmail: string) {
    setStaffMessage(null);
    setBusy(true);

    try {
      const response = await fetch("/api/owner/staff", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: memberEmail }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStaffMessage(data.error || "Unable to remove staff right now.");
        return;
      }

      setStaffMessage(`Removed ${memberEmail} from staff.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);

    try {
      await fetch("/api/owner/session", { method: "DELETE" });
      const supabase = getOwnerSupabaseBrowserClient();
      await supabase?.auth.signOut();
    } finally {
      router.replace("/owner/login");
      router.refresh();
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#080d18",
        color: "#e5e7eb",
        padding: "28px 18px 64px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: 20 }}>
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
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
            <h1 style={{ margin: "6px 0 0", fontSize: 28, color: "white" }}>Owner console</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {email ? (
              <>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{email}</span>
                {role ? (
                  <span
                    style={{
                      background: role === "developer" ? "#312e81" : role === "owner" ? "#4c1d95" : "#1e293b",
                      color: role === "staff" ? "#cbd5e1" : "#ddd6fe",
                      border: "1px solid #5b21b6",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {roleLabel(role)}
                  </span>
                ) : null}
              </>
            ) : null}
            <button type="button" onClick={() => void signOut()} disabled={busy} style={secondaryButton}>
              Sign out
            </button>
          </div>
        </header>

        <section style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18, color: "white" }}>Plans</h2>
          <p style={{ margin: "8px 0 16px", color: "#94a3b8", fontSize: 14 }}>
            Grant or revoke Pro for an existing EasyMath account. Expiry is optional and inclusive of that date.
          </p>
          <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
            <input
              style={fieldStyle}
              placeholder="Account email"
              value={targetEmail}
              onChange={(event) => setTargetEmail(event.target.value)}
            />
            <input
              style={fieldStyle}
              type="date"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              aria-label="Optional Pro expiry date"
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={primaryButton} disabled={busy} onClick={() => void updatePlan("pro")}>
                Grant Pro
              </button>
              <button type="button" style={secondaryButton} disabled={busy} onClick={() => void updatePlan("free")}>
                Revoke Pro
              </button>
            </div>
            {planMessage ? <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#c4b5fd" }}>{planMessage}</p> : null}
          </div>
        </section>

        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 18, color: "white" }}>Accounts</h2>
            <input
              style={{ ...fieldStyle, maxWidth: 280 }}
              placeholder="Search email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {loadError ? <p style={{ color: "#fda4af" }}>{loadError}</p> : null}
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#94a3b8" }}>
                  <th style={{ padding: "8px 6px" }}>Email</th>
                  <th style={{ padding: "8px 6px" }}>Plan</th>
                  <th style={{ padding: "8px 6px" }}>Confirmed</th>
                  <th style={{ padding: "8px 6px" }}>Last app sign-in</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.email} style={{ borderTop: "1px solid #1e293b" }}>
                    <td style={{ padding: "8px 6px", fontWeight: 700 }}>{user.email}</td>
                    <td style={{ padding: "8px 6px" }}>{planSummary(user)}</td>
                    <td style={{ padding: "8px 6px" }}>{user.confirmed ? "Yes" : "No"}</td>
                    <td style={{ padding: "8px 6px" }}>{formatDubai(user.lastSignInAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: 13 }}>No accounts to show.</p>
            ) : null}
          </div>
        </section>

        {canManageStaff ? (
          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: 18, color: "white" }}>Staff</h2>
            <p style={{ margin: "8px 0 16px", color: "#94a3b8", fontSize: 14 }}>
              Staff can sign in to this console and grant or revoke Pro. They cannot add or remove staff.
              They must already have a confirmed EasyMath account.
            </p>
            <form onSubmit={(event) => void addStaff(event)} style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 640 }}>
              <input
                style={{ ...fieldStyle, flex: 1, minWidth: 220 }}
                placeholder="Staff email"
                value={staffEmail}
                onChange={(event) => setStaffEmail(event.target.value)}
              />
              <button type="submit" style={primaryButton} disabled={busy}>
                Add staff
              </button>
            </form>
            {staffMessage ? <p style={{ fontSize: 13, fontWeight: 600, color: "#c4b5fd" }}>{staffMessage}</p> : null}
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#94a3b8" }}>
                    <th style={{ padding: "8px 6px" }}>Email</th>
                    <th style={{ padding: "8px 6px" }}>Added by</th>
                    <th style={{ padding: "8px 6px" }}>Added</th>
                    <th style={{ padding: "8px 6px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((member) => (
                    <tr key={member.email} style={{ borderTop: "1px solid #1e293b" }}>
                      <td style={{ padding: "8px 6px", fontWeight: 700 }}>{member.email}</td>
                      <td style={{ padding: "8px 6px" }}>{member.addedBy}</td>
                      <td style={{ padding: "8px 6px" }}>{formatDubai(member.createdAt)}</td>
                      <td style={{ padding: "8px 6px" }}>
                        <button
                          type="button"
                          style={secondaryButton}
                          disabled={busy}
                          onClick={() => void removeStaff(member.email)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {staff.length === 0 ? <p style={{ color: "#94a3b8", fontSize: 13 }}>No staff added yet.</p> : null}
            </div>
          </section>
        ) : null}

        <section style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18, color: "white" }}>Sign-in activity</h2>
          <p style={{ margin: "8px 0 16px", color: "#94a3b8", fontSize: 14 }}>Times are shown in Asia/Dubai.</p>
          <p style={{ margin: "0 0 8px", fontSize: 14 }}>
            <strong>Last sign-in:</strong> {formatDubai(lastSignInAt)}
          </p>
          <p style={{ margin: "0 0 16px", fontSize: 14 }}>
            <strong>Last sign-out:</strong> {formatDubai(lastSignOutAt)}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#94a3b8" }}>
                  <th style={{ padding: "8px 6px" }}>When</th>
                  <th style={{ padding: "8px 6px" }}>Email</th>
                  <th style={{ padding: "8px 6px" }}>Event</th>
                  <th style={{ padding: "8px 6px" }}>Role</th>
                  <th style={{ padding: "8px 6px" }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} style={{ borderTop: "1px solid #1e293b" }}>
                    <td style={{ padding: "8px 6px" }}>{formatDubai(event.createdAt)}</td>
                    <td style={{ padding: "8px 6px", fontWeight: 700 }}>{event.email}</td>
                    <td style={{ padding: "8px 6px" }}>{event.event === "sign_in" ? "Sign in" : "Sign out"}</td>
                    <td style={{ padding: "8px 6px" }}>{event.role}</td>
                    <td style={{ padding: "8px 6px" }}>{event.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.length === 0 ? <p style={{ color: "#94a3b8", fontSize: 13 }}>No console sign-in activity yet.</p> : null}
          </div>
        </section>

        {isDeveloper && developer ? (
          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: 18, color: "white" }}>Developer</h2>
            <div style={{ display: "grid", gap: 6, marginTop: 12, fontSize: 14 }}>
              <p style={{ margin: 0 }}>
                <strong>App version:</strong> {developer.appVersion}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Commit SHA:</strong> {developer.commitSha || "—"}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Git branch:</strong> {developer.commitRef || "—"}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Vercel env:</strong> {developer.vercelEnv || "—"}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Supabase project id:</strong> {developer.supabaseProjectId || "—"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {(["plan", "staff", "auth"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAuditTab(tab)}
                  style={auditTab === tab ? primaryButton : secondaryButton}
                >
                  {tab === "plan" ? "Plan audit" : tab === "staff" ? "Staff audit" : "Auth audit"}
                </button>
              ))}
            </div>
            <pre
              style={{
                marginTop: 12,
                background: "#080d18",
                border: "1px solid #1e293b",
                borderRadius: 12,
                padding: 12,
                overflowX: "auto",
                fontSize: 12,
                color: "#cbd5e1",
              }}
            >
              {JSON.stringify(developer.audits[auditTab], null, 2)}
            </pre>
          </section>
        ) : null}

        <p
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: "#94a3b8",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span>by</span>
          <Image src="/branding/zayir-ai-logo-purple-dark.png" alt="zayir.ai" width={24} height={24} />
        </p>
      </div>
    </main>
  );
}
