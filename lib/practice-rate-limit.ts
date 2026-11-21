import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { attachGuestCookie, resolveGuestIdentity } from "./guest-identity";
import { createSupabaseAdminClient } from "./supabase/admin";
import { getRequestUser } from "./supabase/server";

/**
 * Abuse limits for Practice Mode (generate / check answers).
 *
 * Practice stays free and does NOT count toward the 5-question daily solver
 * limit. These caps are far above normal study use and only stop scripted
 * or runaway clients from burning OpenAI credits.
 *
 * Storage: the `consume_practice_rate_limit` RPC (supabase/add_practice_rate_limits.sql)
 * called with the server-only admin client, so limits are shared across all
 * serverless instances. If that RPC is not installed yet (or the admin key is
 * missing), we fall back to a best-effort in-memory limiter per instance so the
 * routes keep working before the migration is applied.
 */

export type PracticeRateAction =
  | "generate"
  | "check"
  | "check-unverified"
  // Free photo "read" step (transcribe only, no daily solve used).
  | "scan-read"
  // "Report wrong answer" submissions.
  | "feedback";

type Window = { bucket: string; seconds: number; limit: number };

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Per signed-in user.
const USER_LIMITS: Record<PracticeRateAction, Window[]> = {
  generate: [
    { bucket: "generate:burst", seconds: MINUTE, limit: 12 },
    { bucket: "generate:hour", seconds: HOUR, limit: 120 },
    { bucket: "generate:day", seconds: DAY, limit: 400 },
  ],
  check: [
    { bucket: "check:burst", seconds: MINUTE, limit: 30 },
    { bucket: "check:hour", seconds: HOUR, limit: 300 },
    { bucket: "check:day", seconds: DAY, limit: 1000 },
  ],
  "check-unverified": [
    { bucket: "checku:burst", seconds: MINUTE, limit: 15 },
    { bucket: "checku:day", seconds: DAY, limit: 200 },
  ],
  "scan-read": [
    { bucket: "scan:burst", seconds: MINUTE, limit: 10 },
    { bucket: "scan:hour", seconds: HOUR, limit: 60 },
    { bucket: "scan:day", seconds: DAY, limit: 150 },
  ],
  feedback: [
    { bucket: "feedback:burst", seconds: MINUTE, limit: 6 },
    { bucket: "feedback:day", seconds: DAY, limit: 60 },
  ],
};

// Per guest (signed cookie). Slightly lower than signed-in users.
const GUEST_LIMITS: Record<PracticeRateAction, Window[]> = {
  generate: [
    { bucket: "generate:burst", seconds: MINUTE, limit: 8 },
    { bucket: "generate:hour", seconds: HOUR, limit: 60 },
    { bucket: "generate:day", seconds: DAY, limit: 150 },
  ],
  check: [
    { bucket: "check:burst", seconds: MINUTE, limit: 20 },
    { bucket: "check:hour", seconds: HOUR, limit: 150 },
    { bucket: "check:day", seconds: DAY, limit: 400 },
  ],
  "check-unverified": [
    { bucket: "checku:burst", seconds: MINUTE, limit: 10 },
    { bucket: "checku:day", seconds: DAY, limit: 100 },
  ],
  "scan-read": [
    { bucket: "scan:burst", seconds: MINUTE, limit: 6 },
    { bucket: "scan:hour", seconds: HOUR, limit: 30 },
    { bucket: "scan:day", seconds: DAY, limit: 60 },
  ],
  feedback: [
    { bucket: "feedback:burst", seconds: MINUTE, limit: 4 },
    { bucket: "feedback:day", seconds: DAY, limit: 30 },
  ],
};

// Per hashed IP for guests (cookie clearing / scripts). Generous because a
// classroom or household can share one IP.
const GUEST_IP_LIMITS: Record<PracticeRateAction, Window[]> = {
  generate: [
    { bucket: "ip:generate:burst", seconds: MINUTE, limit: 30 },
    { bucket: "ip:generate:day", seconds: DAY, limit: 600 },
  ],
  check: [
    { bucket: "ip:check:burst", seconds: MINUTE, limit: 60 },
    { bucket: "ip:check:day", seconds: DAY, limit: 1500 },
  ],
  "check-unverified": [
    { bucket: "ip:checku:burst", seconds: MINUTE, limit: 30 },
    { bucket: "ip:checku:day", seconds: DAY, limit: 400 },
  ],
  "scan-read": [
    { bucket: "ip:scan:burst", seconds: MINUTE, limit: 20 },
    { bucket: "ip:scan:day", seconds: DAY, limit: 300 },
  ],
  feedback: [
    { bucket: "ip:feedback:burst", seconds: MINUTE, limit: 15 },
    { bucket: "ip:feedback:day", seconds: DAY, limit: 200 },
  ],
};

export const PRACTICE_RATE_LIMIT_MESSAGE =
  "You're practising really fast! Take a short break and try again in a little while.";
export const SCAN_RATE_LIMIT_MESSAGE =
  "You're scanning really fast! Take a short break and try again in a little while.";
export const FEEDBACK_RATE_LIMIT_MESSAGE =
  "Thanks! We've received a lot of reports from you already. Please try again later.";
export const PRACTICE_DAILY_CAP_MESSAGE =
  "You've done a huge amount of practice today. Great work! Practice will be available again tomorrow.";

type ConsumeResult = { allowed: boolean; retryAfterSeconds: number };

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();
let rpcUnavailableUntil = 0;

function hashKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 40);
}

function consumeMemory(key: string, window: Window): ConsumeResult {
  const now = Date.now();
  const id = `${key}|${window.bucket}`;
  const existing = memoryBuckets.get(id);

  if (memoryBuckets.size > 20_000) {
    for (const [mapKey, entry] of memoryBuckets) {
      if (entry.resetAt <= now) memoryBuckets.delete(mapKey);
    }
  }

  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(id, { count: 1, resetAt: now + window.seconds * 1000 });
    return { allowed: window.limit >= 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= window.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

async function consumeWindow(key: string, window: Window): Promise<ConsumeResult> {
  if (Date.now() >= rpcUnavailableUntil) {
    const admin = createSupabaseAdminClient();

    if (admin) {
      try {
        const { data, error } = await admin.rpc("consume_practice_rate_limit", {
          p_key: key,
          p_bucket: window.bucket,
          p_window_seconds: window.seconds,
          p_limit: window.limit,
        });

        if (!error) {
          const row = (Array.isArray(data) ? data[0] : data) as
            | { allowed?: unknown; retry_after_seconds?: unknown }
            | null;

          if (row && typeof row.allowed === "boolean") {
            return {
              allowed: row.allowed,
              retryAfterSeconds: Number(row.retry_after_seconds) || 0,
            };
          }
        } else {
          // Most likely the migration has not been applied yet. Avoid
          // hammering Supabase; retry the RPC path in 5 minutes.
          console.warn(
            "consume_practice_rate_limit unavailable, using in-memory limiter:",
            error.message
          );
          rpcUnavailableUntil = Date.now() + 5 * 60 * 1000;
        }
      } catch (error) {
        console.warn("consume_practice_rate_limit failed:", error);
        rpcUnavailableUntil = Date.now() + 60 * 1000;
      }
    }
  }

  return consumeMemory(key, window);
}

export type PracticeRateLimitResult =
  | { ok: true; guestCookieToSet: string | null }
  | { ok: false; response: NextResponse };

/**
 * Consume one unit of practice usage for the current user or guest.
 * Returns a ready-made 429 response when a cap is reached.
 */
export async function enforcePracticeRateLimit(
  request: Request,
  action: PracticeRateAction
): Promise<PracticeRateLimitResult> {
  const subjects: Array<{ key: string; windows: Window[] }> = [];
  let guestCookieToSet: string | null = null;

  const auth = await getRequestUser(request);

  if (auth?.user?.id) {
    subjects.push({ key: hashKey(`u:${auth.user.id}`), windows: USER_LIMITS[action] });
  } else {
    const identity = resolveGuestIdentity(request);

    if (identity) {
      guestCookieToSet = identity.cookieToSet;
      subjects.push({ key: hashKey(`g:${identity.guestId}`), windows: GUEST_LIMITS[action] });
      subjects.push({ key: hashKey(`ip:${identity.ipGuestId}`), windows: GUEST_IP_LIMITS[action] });
    } else {
      // No guest secret configured: fall back to a coarse header-based key.
      const ip =
        request.headers.get("x-vercel-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        request.headers.get("x-forwarded-for") ||
        "unknown";
      subjects.push({ key: hashKey(`ipraw:${ip}`), windows: GUEST_IP_LIMITS[action] });
    }
  }

  const checks = subjects.flatMap((subject) =>
    subject.windows.map((window) => ({ key: subject.key, window }))
  );
  const results = await Promise.all(
    checks.map(({ key, window }) => consumeWindow(key, window))
  );

  for (let i = 0; i < checks.length; i += 1) {
    const { window } = checks[i];
    const result = results[i];
    {
      if (!result.allowed) {
        const isDaily = window.seconds >= DAY;
        const error =
          action === "scan-read"
            ? SCAN_RATE_LIMIT_MESSAGE
            : action === "feedback"
              ? FEEDBACK_RATE_LIMIT_MESSAGE
              : isDaily
                ? PRACTICE_DAILY_CAP_MESSAGE
                : PRACTICE_RATE_LIMIT_MESSAGE;
        const response = NextResponse.json(
          {
            error,
            code:
              action === "scan-read"
                ? "SCAN_RATE_LIMITED"
                : action === "feedback"
                  ? "FEEDBACK_RATE_LIMITED"
                  : "PRACTICE_RATE_LIMITED",
            retryAfterSeconds: result.retryAfterSeconds,
          },
          {
            status: 429,
            headers: { "Retry-After": String(result.retryAfterSeconds || 60) },
          }
        );

        return { ok: false, response: attachGuestCookie(response, guestCookieToSet) };
      }
    }
  }

  return { ok: true, guestCookieToSet };
}

/** Attach the guest identity cookie (if newly issued) to a success response. */
export function withPracticeGuestCookie(
  response: NextResponse,
  guestCookieToSet: string | null
): NextResponse {
  return attachGuestCookie(response, guestCookieToSet);
}
