import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  attachGuestCookie,
  resolveGuestIdentity,
} from "@/lib/guest-identity";
import { enforcePracticeRateLimit } from "@/lib/practice-rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/supabase/server";

/**
 * "Report wrong answer" — students flag a solution that looks wrong.
 * Works for signed-in students and guests. Rate limited. Stored in
 * public.solution_feedback (RLS on; only this server route writes).
 * Never trusts a user id from the body.
 */

const REASONS = [
  "wrong_answer",
  "wrong_steps",
  "misread_photo",
  "unclear",
  "other",
] as const;
const SOURCES = ["text", "photo", "practice"] as const;
const PLATFORMS = ["web", "android", "ios", "unknown"] as const;
const LEVELS = ["primary", "middle", "high", "advanced"] as const;

type Reason = (typeof REASONS)[number];

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    const parsed = await request.json();
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that report. Please try again." },
      { status: 400 }
    );
  }

  const question = clip(body.question, 2000);
  const reason = pick<Reason | "">(body.reason, REASONS, "");

  if (!question) {
    return NextResponse.json(
      { error: "Please solve a question before reporting it." },
      { status: 400 }
    );
  }

  if (!reason) {
    return NextResponse.json(
      { error: "Please choose what looks wrong." },
      { status: 400 }
    );
  }

  const limited = await enforcePracticeRateLimit(request, "feedback");

  if (!limited.ok) {
    return limited.response;
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Reporting is temporarily unavailable. Please try again later." },
      { status: 503 }
    );
  }

  const auth = await getRequestUser(request);
  let guestKey: string | null = null;
  let guestCookieToSet: string | null = null;

  if (!auth) {
    const identity = resolveGuestIdentity(request);

    if (identity) {
      guestCookieToSet = identity.cookieToSet;
      guestKey = createHash("sha256")
        .update(`feedback-guest:${identity.guestId}`)
        .digest("hex")
        .slice(0, 64);
    }
  }

  const { error } = await admin.from("solution_feedback").insert({
    user_id: auth?.user.id ?? null,
    guest_key: guestKey,
    platform: pick(body.platform, PLATFORMS, "web"),
    source: pick(body.source, SOURCES, "text"),
    reason,
    comment: clip(body.comment, 1000) || null,
    question,
    solution: clip(body.solution, 20000) || null,
    level: typeof body.level === "string" && (LEVELS as readonly string[]).includes(body.level)
      ? body.level
      : null,
    app_version: clip(body.appVersion, 32) || null,
  });

  if (error) {
    console.error("feedback insert error:", error.message);
    return attachGuestCookie(
      NextResponse.json(
        { error: "We couldn't send that report. Please try again." },
        { status: 500 }
      ),
      guestCookieToSet
    );
  }

  return attachGuestCookie(
    NextResponse.json({
      ok: true,
      message: "Thanks! Our team will check this solution.",
    }),
    guestCookieToSet
  );
}
