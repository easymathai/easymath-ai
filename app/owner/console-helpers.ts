export const DUBAI_TZ = "Asia/Dubai";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dubaiParts(now = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DUBAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function todayInDubai(now = new Date()): string {
  const { year, month, day } = dubaiParts(now);
  return formatYmd(year, month, day);
}

export function addDubaiDays(days: number, now = new Date()): string {
  const { year, month, day } = dubaiParts(now);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDubaiMonths(months: number, now = new Date()): string {
  const { year, month, day } = dubaiParts(now);
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonthIndex = total % 12;
  const lastDay = new Date(Date.UTC(nextYear, nextMonthIndex + 1, 0)).getUTCDate();
  return formatYmd(nextYear, nextMonthIndex + 1, Math.min(day, lastDay));
}

/** Exactly one calendar month from today in Asia/Dubai. */
export function defaultProExpiryDate(now = new Date()): string {
  return addDubaiMonths(1, now);
}

export function formatDubai(value: string | null | undefined): string {
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

export function formatDubaiDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-GB", {
    timeZone: DUBAI_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatExpiryInput(value: string): string {
  if (!value) {
    return "no expiry";
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Whole days remaining until the stored expiry instant. Negative if already passed. */
export function daysUntilExpiry(expiresAt: string | null | undefined, now = new Date()): number | null {
  if (!expiresAt) {
    return null;
  }

  const end = new Date(expiresAt);

  if (Number.isNaN(end.getTime())) {
    return null;
  }

  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

export type ExpiryTone = "free" | "none" | "ok" | "soon" | "expired";

export function expiryBadge(
  plan: "free" | "pro",
  expired: boolean,
  expiresAt: string | null,
  now = new Date()
): { label: string; tone: ExpiryTone } {
  if (plan !== "pro" && !expired) {
    return { label: "Free", tone: "free" };
  }

  const days = daysUntilExpiry(expiresAt, now);

  if (days == null) {
    return { label: "No expiry", tone: "none" };
  }

  if (days < 0 || expired) {
    return { label: "Expired", tone: "expired" };
  }

  if (days === 0) {
    return { label: "Expires today", tone: "soon" };
  }

  if (days === 1) {
    return { label: "1 day left", tone: "soon" };
  }

  if (days <= 7) {
    return { label: `${days} days left`, tone: "soon" };
  }

  return { label: `${days} days left`, tone: "ok" };
}

export const EXPIRY_PRESETS = [
  { id: "1w", label: "1 week", kind: "days" as const, amount: 7 },
  { id: "1m", label: "1 month", kind: "months" as const, amount: 1 },
  { id: "3m", label: "3 months", kind: "months" as const, amount: 3 },
  { id: "6m", label: "6 months", kind: "months" as const, amount: 6 },
  { id: "1y", label: "1 year", kind: "months" as const, amount: 12 },
  { id: "none", label: "No expiry", kind: "none" as const, amount: 0 },
];

export function presetExpiryValue(id: string, now = new Date()): string {
  const preset = EXPIRY_PRESETS.find((item) => item.id === id);

  if (!preset || preset.kind === "none") {
    return "";
  }

  if (preset.kind === "days") {
    return addDubaiDays(preset.amount, now);
  }

  return addDubaiMonths(preset.amount, now);
}

export function activePresetId(expiry: string, now = new Date()): string | null {
  for (const preset of EXPIRY_PRESETS) {
    if (presetExpiryValue(preset.id, now) === expiry) {
      return preset.id;
    }
  }

  return null;
}

function copyTextFallback(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("contenteditable", "true");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.width = "2em";
  field.style.height = "2em";
  field.style.padding = "0";
  field.style.border = "none";
  field.style.outline = "none";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, text.length);

  let ok = false;

  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }

  document.body.removeChild(field);
  return ok;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // iPhone Safari may reject the clipboard API; use the execCommand fallback.
  }

  return copyTextFallback(text);
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function accountsToCsv(
  rows: Array<{
    email: string;
    plan: string;
    planExpiresAt: string | null;
    confirmed: boolean;
    lastSignInAt: string | null;
    createdAt: string | null;
    expired: boolean;
  }>
): string {
  const header = [
    "Email",
    "Plan",
    "Expiry",
    "Days left",
    "Confirmed",
    "Signed up",
    "Last app sign-in",
  ];

  const lines = rows.map((row) => {
    const days = daysUntilExpiry(row.planExpiresAt);
    const planLabel = row.expired ? "Free (Pro expired)" : row.plan === "pro" ? "Pro" : "Free";
    const expiryLabel =
      row.plan === "pro" && !row.planExpiresAt
        ? "No expiry"
        : row.planExpiresAt
          ? formatDubai(row.planExpiresAt)
          : "";

    return [
      row.email,
      planLabel,
      expiryLabel,
      days == null ? (row.plan === "pro" && !row.expired ? "No expiry" : "") : String(days),
      row.confirmed ? "Yes" : "No",
      formatDubai(row.createdAt),
      formatDubai(row.lastSignInAt),
    ]
      .map(csvCell)
      .join(",");
  });

  return [header.join(","), ...lines].join("\n");
}

export function downloadTextFile(filename: string, contents: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
