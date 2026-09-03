import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/server";

export const PRACTICE_SID_COOKIE = "ema_practice_sid";
export const PRACTICE_TOKEN_TTL_SECONDS = 4 * 60 * 60;

export const PRACTICE_TOKEN_MISSING_MESSAGE =
  "Generate a practice question first, then try Show Solution.";
export const PRACTICE_TOKEN_INVALID_MESSAGE =
  "This practice question isn't valid anymore. Generate a new practice question and try Show Solution again.";
export const PRACTICE_TOKEN_CONFIG_MESSAGE =
  "Practice solutions are temporarily unavailable. Please try again later.";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getPracticeTokenSecret(): string | null {
  const secret = process.env.PRACTICE_TOKEN_SECRET?.trim() || "";

  if (secret.length < 16) {
    return null;
  }

  return secret;
}

function toBase64Url(value: Buffer | string): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return buffer.toString("base64url");
}

function normalizePracticeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ");
}

export function hashPracticeQuestion(question: string): string {
  return createHash("sha256")
    .update(normalizePracticeQuestion(question), "utf8")
    .digest("hex");
}

export function extractPracticeQuestion(solution: string): string {
  const heading = "PRACTICE QUESTION";
  const start = solution.indexOf(heading);

  if (start === -1) {
    return "";
  }

  return solution
    .slice(start + heading.length)
    .replace(/Great job![\s\S]*$/, "")
    .trim();
}

function readGuestSid(request: Request): string | null {
  const header = request.headers.get("cookie") || "";
  const parts = header.split(";");

  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");

    if (eq === -1) {
      continue;
    }

    const name = trimmed.slice(0, eq).trim();

    if (name !== PRACTICE_SID_COOKIE) {
      continue;
    }

    const value = trimmed.slice(eq + 1).trim();

    if (/^[a-f0-9]{32}$/.test(value)) {
      return value;
    }
  }

  return null;
}

export function applyPracticeSidCookie(
  response: NextResponse,
  sid: string
): void {
  response.cookies.set({
    name: PRACTICE_SID_COOKIE,
    value: sid,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function jsonWithPracticeCookie(
  body: unknown,
  guestSidToSet: string | null
): NextResponse {
  const response = NextResponse.json(body);

  if (guestSidToSet) {
    applyPracticeSidCookie(response, guestSidToSet);
  }

  return response;
}

type PracticeActor = {
  userId: string | null;
  guestSid: string | null;
  guestSidToSet: string | null;
};

async function resolvePracticeActor(
  request: Request,
  createGuestSid: boolean
): Promise<PracticeActor> {
  const auth = await getRequestUser(request);
  const existingGuestSid = readGuestSid(request);

  if (auth?.user?.id) {
    return {
      userId: auth.user.id,
      guestSid: existingGuestSid,
      guestSidToSet: null,
    };
  }

  if (existingGuestSid) {
    return {
      userId: null,
      guestSid: existingGuestSid,
      guestSidToSet: null,
    };
  }

  if (!createGuestSid) {
    return {
      userId: null,
      guestSid: null,
      guestSidToSet: null,
    };
  }

  const guestSid = randomBytes(16).toString("hex");

  return {
    userId: null,
    guestSid,
    guestSidToSet: guestSid,
  };
}

function subjectForIssue(actor: PracticeActor): string {
  if (actor.userId) {
    return `u:${actor.userId}`;
  }

  return `g:${actor.guestSid}`;
}

function subjectMatches(tokenSub: string, actor: PracticeActor): boolean {
  if (actor.userId && tokenSub === `u:${actor.userId}`) {
    return true;
  }

  if (actor.guestSid && tokenSub === `g:${actor.guestSid}`) {
    return true;
  }

  return false;
}

function signPayload(payloadB64: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payloadB64).digest();
}

function signQuestion(question: string, subject: string, secret: string): string {
  const payloadB64 = toBase64Url(
    JSON.stringify({
      v: 1,
      qh: hashPracticeQuestion(question),
      sub: subject,
      exp: Math.floor(Date.now() / 1000) + PRACTICE_TOKEN_TTL_SECONDS,
    })
  );

  return `${payloadB64}.${toBase64Url(signPayload(payloadB64, secret))}`;
}

export async function signPracticeQuestions(
  request: Request,
  questions: string[]
): Promise<
  | { ok: true; tokens: string[]; guestSidToSet: string | null }
  | { ok: false; reason: "missing-secret" }
> {
  const filtered = questions.map((item) => item.trim()).filter(Boolean);

  if (filtered.length === 0) {
    return { ok: true, tokens: [], guestSidToSet: null };
  }

  const secret = getPracticeTokenSecret();

  if (!secret) {
    console.error(
      "PRACTICE_TOKEN_SECRET is missing or too short. Add a 16+ character server-only secret."
    );
    return { ok: false, reason: "missing-secret" };
  }

  const actor = await resolvePracticeActor(request, true);
  const subject = subjectForIssue(actor);
  const tokens = filtered.map((question) =>
    signQuestion(question, subject, secret)
  );

  return {
    ok: true,
    tokens,
    guestSidToSet: actor.guestSidToSet,
  };
}

export type PracticeTokenFailure = {
  ok: false;
  status: 400 | 403 | 503;
  error: string;
};

export async function verifyPracticeToken(
  request: Request,
  question: unknown,
  token: unknown
): Promise<{ ok: true } | PracticeTokenFailure> {
  const secret = getPracticeTokenSecret();

  if (!secret) {
    console.error(
      "PRACTICE_TOKEN_SECRET is missing or too short. Add a 16+ character server-only secret."
    );
    return {
      ok: false,
      status: 503,
      error: PRACTICE_TOKEN_CONFIG_MESSAGE,
    };
  }

  if (typeof question !== "string" || !question.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Please include the practice question.",
    };
  }

  if (typeof token !== "string" || !token.trim()) {
    return {
      ok: false,
      status: 400,
      error: PRACTICE_TOKEN_MISSING_MESSAGE,
    };
  }

  const parts = token.trim().split(".");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      ok: false,
      status: 403,
      error: PRACTICE_TOKEN_INVALID_MESSAGE,
    };
  }

  const [payloadB64, signatureB64] = parts;
  let provided: Buffer;

  try {
    provided = Buffer.from(signatureB64, "base64url");
  } catch {
    return {
      ok: false,
      status: 403,
      error: PRACTICE_TOKEN_INVALID_MESSAGE,
    };
  }

  const expected = signPayload(payloadB64, secret);

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return {
      ok: false,
      status: 403,
      error: PRACTICE_TOKEN_INVALID_MESSAGE,
    };
  }

  let payload: { v?: unknown; qh?: unknown; sub?: unknown; exp?: unknown };

  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return {
      ok: false,
      status: 403,
      error: PRACTICE_TOKEN_INVALID_MESSAGE,
    };
  }

  if (
    payload.v !== 1 ||
    typeof payload.qh !== "string" ||
    typeof payload.sub !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return {
      ok: false,
      status: 403,
      error: PRACTICE_TOKEN_INVALID_MESSAGE,
    };
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return {
      ok: false,
      status: 403,
      error: PRACTICE_TOKEN_INVALID_MESSAGE,
    };
  }

  if (payload.qh !== hashPracticeQuestion(question)) {
    return {
      ok: false,
      status: 403,
      error: PRACTICE_TOKEN_INVALID_MESSAGE,
    };
  }

  const actor = await resolvePracticeActor(request, false);

  if (!subjectMatches(payload.sub, actor)) {
    return {
      ok: false,
      status: 403,
      error: PRACTICE_TOKEN_INVALID_MESSAGE,
    };
  }

  return { ok: true };
}
