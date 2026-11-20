"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getOwnerSupabaseBrowserClient } from "@/lib/supabase/owner-client";
import {
  EXPIRY_PRESETS,
  accountsToCsv,
  activePresetId,
  copyText,
  daysUntilExpiry,
  defaultProExpiryDate,
  downloadTextFile,
  expiryBadge,
  formatDubai,
  formatDubaiDate,
  formatExpiryInput,
  presetExpiryValue,
  todayInDubai,
  type ExpiryTone,
} from "./console-helpers";

type ConsoleRole = "developer" | "owner" | "staff";

type OwnerUser = {
  email: string;
  plan: "free" | "pro";
  storedPlan: "free" | "pro";
  planExpiresAt: string | null;
  expired: boolean;
  confirmed: boolean;
  lastSignInAt: string | null;
  createdAt: string | null;
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

type PlanChange = {
  id: string;
  actorEmail: string;
  targetEmail: string;
  fromPlan: string;
  toPlan: string;
  fromPlanExpiresAt: string | null;
  toPlanExpiresAt: string | null;
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

type PlanFilter = "all" | "pro" | "free";
type ConfirmedFilter = "all" | "yes" | "no";
type ExpiryFilter = "all" | "soon" | "expired" | "none";
type SortKey = "email" | "plan" | "expiry" | "lastSignIn" | "createdAt";

type Toast = { id: number; kind: "ok" | "error"; text: string };

type ConfirmDialog = {
  action: "grant" | "revoke";
  email: string;
  title: string;
  body: string;
};

function roleLabel(role: ConsoleRole): string {
  if (role === "developer") {
    return "Developer";
  }

  if (role === "owner") {
    return "Owner";
  }

  return "Staff";
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

function isExpiringSoon(user: OwnerUser, now = new Date()): boolean {
  if (user.plan !== "pro") {
    return false;
  }

  const days = daysUntilExpiry(user.planExpiresAt, now);
  return days != null && days >= 0 && days <= 7;
}

function badgeColors(tone: ExpiryTone): CSSProperties {
  switch (tone) {
    case "ok":
      return { background: "#14532d", color: "#bbf7d0", border: "1px solid #166534" };
    case "soon":
      return { background: "#78350f", color: "#fde68a", border: "1px solid #a16207" };
    case "expired":
      return { background: "#7f1d1d", color: "#fecaca", border: "1px solid #b91c1c" };
    case "none":
      return { background: "#312e81", color: "#ddd6fe", border: "1px solid #4c1d95" };
    default:
      return { background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155" };
  }
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

const smallButton: CSSProperties = {
  ...secondaryButton,
  padding: "8px 10px",
  fontSize: 12,
  minHeight: 40,
};

const cardStyle: CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 16,
  padding: 20,
};


function EmailButton({
  value,
  copied,
  onSelect,
}: {
  value: string;
  copied: boolean;
  onSelect: (email: string) => void;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        title="Copy email"
        aria-label={`Copy ${value}`}
        onClick={() => onSelect(value)}
        onMouseEnter={(event) => {
          event.currentTarget.style.color = "#c4b5fd";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.color = "#e5e7eb";
        }}
        style={{
          border: "none",
          background: "transparent",
          color: "#e5e7eb",
          fontWeight: 700,
          fontSize: 13,
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          wordBreak: "break-all",
        }}
      >
        {value}
      </button>
      {copied ? <span style={{ color: "#86efac", fontSize: 11, fontWeight: 800 }}>Copied</span> : null}
    </span>
  );
}

function RowActions({
  user,
  busy,
  onCopy,
  onGrant,
  onRevoke,
}: {
  user: OwnerUser;
  busy: boolean;
  onCopy: (email: string) => void;
  onGrant: (user: OwnerUser) => void;
  onRevoke: (email: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button type="button" style={smallButton} disabled={busy} onClick={() => onCopy(user.email)}>
        Copy
      </button>
      <button type="button" style={smallButton} disabled={busy} onClick={() => onGrant(user)}>
        {user.plan === "pro" ? "Extend" : "Grant Pro"}
      </button>
      <button
        type="button"
        style={smallButton}
        disabled={busy || (user.plan !== "pro" && !user.expired)}
        onClick={() => onRevoke(user.email)}
      >
        Revoke
      </button>
    </div>
  );
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onToggle: (column: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      style={{
        border: "none",
        background: "transparent",
        color: active ? "#c4b5fd" : "#94a3b8",
        fontWeight: 800,
        fontSize: 12,
        padding: 0,
        cursor: "pointer",
        letterSpacing: "0.02em",
      }}
    >
      {label}
      {active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}

export default function OwnerConsole() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<ConsoleRole | null>(null);
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const [lastSignOutAt, setLastSignOutAt] = useState<string | null>(null);
  const [users, setUsers] = useState<OwnerUser[]>([]);
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [confirmedFilter, setConfirmedFilter] = useState<ConfirmedFilter>("all");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("email");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [targetEmail, setTargetEmail] = useState("");
  const [expiry, setExpiry] = useState(() => defaultProExpiryDate());
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffMessage, setStaffMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [changes, setChanges] = useState<PlanChange[]>([]);
  const [developer, setDeveloper] = useState<DeveloperInfo | null>(null);
  const [auditTab, setAuditTab] = useState<"plan" | "staff" | "auth">("plan");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null);
  const plansRef = useRef<HTMLElement | null>(null);

  const canManageStaff = role === "owner" || role === "developer";
  const isDeveloper = role === "developer";
  const selectedPreset = activePresetId(expiry);

  const pushToast = useCallback((kind: Toast["kind"], text: string) => {
    const id = toastIdRef.current;
    toastIdRef.current += 1;
    setToasts((current) => [...current.slice(-4), { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

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

    const [usersRes, activityRes, changesRes] = await Promise.all([
      fetch("/api/owner/users", { cache: "no-store" }),
      fetch("/api/owner/activity", { cache: "no-store" }),
      fetch("/api/owner/plan", { cache: "no-store" }),
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

    if (changesRes.ok) {
      const data = (await changesRes.json()) as { changes: PlanChange[] };
      setChanges(data.changes || []);
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

    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const stats = useMemo(() => {
    const total = users.length;
    const pro = users.filter((user) => user.plan === "pro").length;
    const soon = users.filter((user) => isExpiringSoon(user)).length;
    const confirmed = users.filter((user) => user.confirmed).length;
    const unconfirmed = total - confirmed;
    return { total, pro, soon, confirmed, unconfirmed };
  }, [users]);

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = users.filter((user) => {
      if (q && !user.email.toLowerCase().includes(q)) {
        return false;
      }

      if (planFilter === "pro" && user.plan !== "pro") {
        return false;
      }

      if (planFilter === "free" && user.plan === "pro") {
        return false;
      }

      if (confirmedFilter === "yes" && !user.confirmed) {
        return false;
      }

      if (confirmedFilter === "no" && user.confirmed) {
        return false;
      }

      if (expiryFilter === "soon" && !isExpiringSoon(user)) {
        return false;
      }

      if (expiryFilter === "expired" && !user.expired) {
        return false;
      }

      if (expiryFilter === "none" && !(user.plan === "pro" && !user.planExpiresAt)) {
        return false;
      }

      return true;
    });

    const direction = sortDir === "asc" ? 1 : -1;

    return filtered.sort((a, b) => {
      const emptyLast = (value: number | null) => (value == null ? Number.POSITIVE_INFINITY * direction : value);

      if (sortKey === "plan") {
        return (a.plan.localeCompare(b.plan) || a.email.localeCompare(b.email)) * direction;
      }

      if (sortKey === "expiry") {
        const aDays = emptyLast(daysUntilExpiry(a.planExpiresAt));
        const bDays = emptyLast(daysUntilExpiry(b.planExpiresAt));
        if (aDays !== bDays) {
          return aDays < bDays ? -direction : direction;
        }
        return a.email.localeCompare(b.email) * direction;
      }

      if (sortKey === "lastSignIn" || sortKey === "createdAt") {
        const aTime = Date.parse((sortKey === "lastSignIn" ? a.lastSignInAt : a.createdAt) || "") || 0;
        const bTime = Date.parse((sortKey === "lastSignIn" ? b.lastSignInAt : b.createdAt) || "") || 0;
        if (aTime !== bTime) {
          return (aTime - bTime) * direction;
        }
        return a.email.localeCompare(b.email) * direction;
      }

      return a.email.localeCompare(b.email) * direction;
    });
  }, [users, query, planFilter, confirmedFilter, expiryFilter, sortKey, sortDir]);

  const filtersActive =
    planFilter !== "all" || confirmedFilter !== "all" || expiryFilter !== "all" || query.trim().length > 0;

  async function updatePlan(plan: "free" | "pro", emailOverride?: string) {
    const emailValue = (emailOverride || targetEmail).trim().toLowerCase();

    if (!emailValue) {
      pushToast("error", "Enter the account email first.");
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
        pushToast("error", data.error || "Unable to update that plan right now.");
        return;
      }

      const grantedTo = data.email || emailValue;
      pushToast(
        "ok",
        plan === "pro"
          ? expiry
            ? `Pro granted to ${grantedTo} until ${formatExpiryInput(expiry)}.`
            : `Pro granted to ${grantedTo} with no expiry.`
          : `Pro revoked for ${grantedTo}.`
      );
      setTargetEmail("");
      if (plan === "pro") {
        setExpiry(defaultProExpiryDate());
      }
      await load();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function selectAccountEmail(accountEmail: string, scrollToPlans = true) {
    setTargetEmail(accountEmail);

    if (scrollToPlans) {
      plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const copied = await copyText(accountEmail);

    if (!copied) {
      pushToast("error", "Couldn't copy that email. It's filled in the Plans field.");
      return;
    }

    setCopiedEmail(accountEmail);

    if (copiedTimerRef.current) {
      window.clearTimeout(copiedTimerRef.current);
    }

    copiedTimerRef.current = window.setTimeout(() => {
      setCopiedEmail((current) => (current === accountEmail ? null : current));
    }, 1600);
  }

  function askGrant(user: OwnerUser) {
    setTargetEmail(user.email);
    const extending = user.plan === "pro";
    setConfirm({
      action: "grant",
      email: user.email,
      title: extending ? "Extend Pro" : "Grant Pro",
      body: expiry
        ? `${extending ? "Extend" : "Grant"} Pro for ${user.email} until ${formatExpiryInput(expiry)} (inclusive).`
        : `${extending ? "Extend" : "Grant"} Pro for ${user.email} with no expiry.`,
    });
  }

  function askRevoke(userEmail: string) {
    setTargetEmail(userEmail);
    setConfirm({
      action: "revoke",
      email: userEmail,
      title: "Revoke Pro",
      body: `Revoke Pro for ${userEmail}? They will go back to the Free plan.`,
    });
  }

  function exportCsv() {
    const csv = accountsToCsv(visibleUsers);
    downloadTextFile(`easymath-accounts-${todayInDubai()}.csv`, csv);
    pushToast("ok", `Exported ${visibleUsers.length} account${visibleUsers.length === 1 ? "" : "s"}.`);
  }

  function clearFilters() {
    setQuery("");
    setPlanFilter("all");
    setConfirmedFilter("all");
    setExpiryFilter("all");
    setSortKey("email");
    setSortDir("asc");
  }

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(next);
    setSortDir(next === "email" ? "asc" : "desc");
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
      <style>{`
        @keyframes ownerPulse { 50% { opacity: .45 } }
        .owner-skeleton { animation: ownerPulse 1.2s ease-in-out infinite; background: #1e293b; border-radius: 8px; }
        .owner-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .owner-table-wrap { display: block; overflow-x: auto; }
        .owner-cards { display: none; gap: 12px; }
        @media (max-width: 800px) {
          .owner-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .owner-table-wrap { display: none; }
          .owner-cards { display: grid; }
        }
      `}</style>

      <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gap: 20 }}>
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

        <section className="owner-stats" aria-label="Account stats">
          {[
            {
              key: "total",
              label: "Total users",
              value: stats.total,
              active: !filtersActive,
              onClick: () => clearFilters(),
            },
            {
              key: "pro",
              label: "Pro",
              value: stats.pro,
              active: planFilter === "pro" && expiryFilter === "all",
              onClick: () => {
                setPlanFilter("pro");
                setExpiryFilter("all");
                setConfirmedFilter("all");
              },
            },
            {
              key: "soon",
              label: "Expiring in 7 days",
              value: stats.soon,
              active: expiryFilter === "soon",
              onClick: () => {
                setPlanFilter("all");
                setExpiryFilter("soon");
              },
            },
            {
              key: "unconfirmed",
              label: "Unconfirmed",
              value: stats.unconfirmed,
              hint: `${stats.confirmed} confirmed`,
              active: confirmedFilter === "no",
              onClick: () => {
                setConfirmedFilter(confirmedFilter === "no" ? "all" : "no");
              },
            },
          ].map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              style={{
                ...cardStyle,
                padding: 16,
                textAlign: "left",
                cursor: "pointer",
                borderColor: card.active ? "#7c3aed" : "#1e293b",
                boxShadow: card.active ? "0 0 0 1px #7c3aed" : "none",
              }}
            >
              <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>{card.label}</div>
              {loading ? (
                <div className="owner-skeleton" style={{ height: 28, width: 64, marginTop: 8 }} />
              ) : (
                <div style={{ fontSize: 28, fontWeight: 800, color: "white", marginTop: 4 }}>{card.value}</div>
              )}
              {card.hint && !loading ? (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{card.hint}</div>
              ) : null}
            </button>
          ))}
        </section>

        <section ref={plansRef} style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18, color: "white" }}>Plans</h2>
          <p style={{ margin: "8px 0 16px", color: "#94a3b8", fontSize: 14 }}>
            Grant or revoke Pro for an existing EasyMath account. Expiry defaults to one month from today
            (Asia/Dubai), is inclusive of that date, and can be changed or cleared.
          </p>
          <div style={{ display: "grid", gap: 12, maxWidth: 640 }}>
            <input
              style={fieldStyle}
              placeholder="Account email"
              value={targetEmail}
              onChange={(event) => setTargetEmail(event.target.value)}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {EXPIRY_PRESETS.map((preset) => {
                const active = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setExpiry(presetExpiryValue(preset.id))}
                    style={{
                      border: active ? "1px solid #7c3aed" : "1px solid #334155",
                      background: active ? "#4c1d95" : "transparent",
                      color: active ? "#ede9fe" : "#cbd5e1",
                      padding: "8px 12px",
                      borderRadius: 999,
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                      minHeight: 40,
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
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
              <button
                type="button"
                style={secondaryButton}
                disabled={busy}
                onClick={() => {
                  if (!targetEmail.trim()) {
                    pushToast("error", "Enter the account email first.");
                    return;
                  }
                  askRevoke(targetEmail.trim().toLowerCase());
                }}
              >
                Revoke Pro
              </button>
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 18, color: "white" }}>Accounts</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                style={{ ...fieldStyle, maxWidth: 260, margin: 0 }}
                placeholder="Search email"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="button" style={secondaryButton} disabled={busy || visibleUsers.length === 0} onClick={exportCsv}>
                Export CSV
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            {(
              [
                ["plan", planFilter, setPlanFilter, [
                  ["all", "All plans"],
                  ["pro", "Pro"],
                  ["free", "Free"],
                ]],
                ["confirmed", confirmedFilter, setConfirmedFilter, [
                  ["all", "All accounts"],
                  ["yes", "Confirmed"],
                  ["no", "Unconfirmed"],
                ]],
                ["expiry", expiryFilter, setExpiryFilter, [
                  ["all", "Any expiry"],
                  ["soon", "Expiring in 7 days"],
                  ["expired", "Expired"],
                  ["none", "No expiry"],
                ]],
              ] as const
            ).map(([group, value, setter, options]) => (
              <select
                key={group}
                value={value}
                onChange={(event) => setter(event.target.value as never)}
                style={{ ...fieldStyle, width: "auto", minWidth: 160, padding: "8px 10px" }}
                aria-label={String(group)}
              >
                {options.map(([option, label]) => (
                  <option key={option} value={option}>
                    {label}
                  </option>
                ))}
              </select>
            ))}
            {filtersActive ? (
              <button type="button" style={smallButton} onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>

          {loadError ? <p style={{ color: "#fda4af" }}>{loadError}</p> : null}

          {loading ? (
            <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
              <div className="owner-skeleton" style={{ height: 18 }} />
              <div className="owner-skeleton" style={{ height: 18 }} />
              <div className="owner-skeleton" style={{ height: 18 }} />
            </div>
          ) : null}

          {!loading ? (
            <>
              <p style={{ margin: "12px 0 8px", color: "#64748b", fontSize: 12, fontWeight: 700 }}>
                {visibleUsers.length} of {users.length} accounts
              </p>
              <div className="owner-table-wrap">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#94a3b8" }}>
                      <th style={{ padding: "8px 6px" }}>
                        <SortHeader label="Email" column="email" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                      </th>
                      <th style={{ padding: "8px 6px" }}>
                        <SortHeader label="Plan" column="plan" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                      </th>
                      <th style={{ padding: "8px 6px" }}>
                        <SortHeader label="Expiry" column="expiry" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                      </th>
                      <th style={{ padding: "8px 6px" }}>Confirmed</th>
                      <th style={{ padding: "8px 6px" }}>
                        <SortHeader label="Signed up" column="createdAt" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                      </th>
                      <th style={{ padding: "8px 6px" }}>
                        <SortHeader label="Last app sign-in" column="lastSignIn" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                      </th>
                      <th style={{ padding: "8px 6px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((user) => {
                      const badge = expiryBadge(user.plan, user.expired, user.planExpiresAt);
                      return (
                        <tr key={user.email} style={{ borderTop: "1px solid #1e293b" }}>
                          <td style={{ padding: "10px 6px" }}>
                            <EmailButton value={user.email} copied={copiedEmail === user.email} onSelect={(value) => void selectAccountEmail(value)} />
                          </td>
                          <td style={{ padding: "10px 6px" }}>{planSummary(user)}</td>
                          <td style={{ padding: "10px 6px" }}>
                            <span
                              style={{
                                ...badgeColors(badge.tone),
                                display: "inline-block",
                                borderRadius: 999,
                                padding: "3px 8px",
                                fontSize: 11,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ padding: "10px 6px" }}>{user.confirmed ? "Yes" : "No"}</td>
                          <td style={{ padding: "10px 6px" }}>{formatDubaiDate(user.createdAt)}</td>
                          <td style={{ padding: "10px 6px" }}>{formatDubai(user.lastSignInAt)}</td>
                          <td style={{ padding: "10px 6px" }}>
                            <RowActions user={user} busy={busy} onCopy={(value) => void selectAccountEmail(value)} onGrant={askGrant} onRevoke={askRevoke} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="owner-cards">
                {visibleUsers.map((user) => {
                  const badge = expiryBadge(user.plan, user.expired, user.planExpiresAt);
                  return (
                    <article key={user.email} style={{ ...cardStyle, padding: 16, background: "#0b1220" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <EmailButton value={user.email} copied={copiedEmail === user.email} onSelect={(value) => void selectAccountEmail(value)} />
                        <span
                          style={{
                            ...badgeColors(badge.tone),
                            borderRadius: 999,
                            padding: "3px 8px",
                            fontSize: 11,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p style={{ margin: "10px 0 0", fontSize: 13, color: "#cbd5e1" }}>{planSummary(user)}</p>
                      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8" }}>
                        {user.confirmed ? "Confirmed" : "Unconfirmed"} · Signed up {formatDubaiDate(user.createdAt)}
                      </p>
                      <p style={{ margin: "4px 0 12px", fontSize: 12, color: "#94a3b8" }}>
                        Last app sign-in {formatDubai(user.lastSignInAt)}
                      </p>
                      <RowActions user={user} busy={busy} onCopy={(value) => void selectAccountEmail(value)} onGrant={askGrant} onRevoke={askRevoke} />
                    </article>
                  );
                })}
              </div>

              {visibleUsers.length === 0 ? (
                <div style={{ padding: "28px 8px", textAlign: "center" }}>
                  <p style={{ margin: 0, color: "#e5e7eb", fontWeight: 700 }}>
                    {users.length === 0 ? "No accounts to show yet." : "No accounts match these filters."}
                  </p>
                  {filtersActive ? (
                    <button type="button" style={{ ...secondaryButton, marginTop: 12 }} onClick={clearFilters}>
                      Clear filters
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18, color: "white" }}>Recent changes</h2>
          <p style={{ margin: "8px 0 16px", color: "#94a3b8", fontSize: 14 }}>
            Plan grants and revokes, newest first. Times are in Asia/Dubai.
          </p>
          {loading ? (
            <div className="owner-skeleton" style={{ height: 48 }} />
          ) : changes.length === 0 ? (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>No plan changes recorded yet.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {changes.map((change) => {
                const granted = change.toPlan === "pro";
                const expiryLabel = granted
                  ? change.toPlanExpiresAt
                    ? ` until ${formatDubai(change.toPlanExpiresAt)}`
                    : " with no expiry"
                  : "";
                return (
                  <li
                    key={change.id}
                    style={{
                      border: "1px solid #1e293b",
                      borderRadius: 12,
                      padding: "10px 12px",
                      background: "#0b1220",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{formatDubai(change.createdAt)}</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: "#e5e7eb" }}>
                      <strong>{change.actorEmail}</strong>
                      {granted ? " granted Pro to " : " revoked Pro from "}
                      <strong>{change.targetEmail}</strong>
                      {expiryLabel}.
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
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
          {events.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>No console sign-in activity yet.</p>
          ) : (
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
            </div>
          )}
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
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
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

      {toasts.length > 0 ? (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            display: "grid",
            gap: 8,
            zIndex: 40,
            width: "min(360px, calc(100vw - 32px))",
          }}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              style={{
                background: toast.kind === "ok" ? "#14532d" : "#7f1d1d",
                color: toast.kind === "ok" ? "#bbf7d0" : "#fecaca",
                border: `1px solid ${toast.kind === "ok" ? "#166534" : "#b91c1c"}`,
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 13,
                fontWeight: 700,
                boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              }}
            >
              {toast.text}
            </div>
          ))}
        </div>
      ) : null}

      {confirm ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-confirm-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div style={{ ...cardStyle, width: "min(440px, 100%)", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}>
            <h2 id="owner-confirm-title" style={{ margin: 0, fontSize: 18, color: "white" }}>
              {confirm.title}
            </h2>
            <p style={{ margin: "12px 0 20px", color: "#cbd5e1", fontSize: 14, lineHeight: 1.5 }}>{confirm.body}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" style={secondaryButton} disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                style={primaryButton}
                disabled={busy}
                onClick={() => void updatePlan(confirm.action === "revoke" ? "free" : "pro", confirm.email)}
              >
                {confirm.action === "revoke" ? "Revoke Pro" : confirm.title}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
