import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const GUEST_ID_COOKIE = "ema_guest_id";
export const GUEST_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export const GUEST_USAGE_CONFIG_MESSAGE =
  "We couldn't verify today's solver limit right now. Please try again in a moment.";

const GUEST_ID_PATTERN = /^[a-f0-9]{32}$/;
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

/** Server-only secret for guest cookies and guest usage RPCs. Not PRACTICE_TOKEN_SECRET. */
export function getGuestUsageSecret(): string | null {
  const secret = process.env.GUEST_USAGE_SECRET?.trim() || "";

  if (secret.length < 16) {
    return null;
  }

  return secret;
}

function toBase64Url(value: Buffer | string): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return buffer.toString("base64url");
}

function signPayload(payloadB64: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payloadB64).digest();
}

function newGuestId(): string {
  return randomBytes(16).toString("hex");
}

function signGuestId(guestId: string, secret: string): string {
  const payloadB64 = toBase64Url(
    JSON.stringify({
      v: 1,
      gid: guestId,
    })
  );

  return `${payloadB64}.${toBase64Url(signPayload(payloadB64, secret))}`;
}

function readCookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") || "";
  const parts = header.split(";");

  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");

    if (eq === -1) {
      continue;
    }

    const cookieName = trimmed.slice(0, eq).trim();

    if (cookieName !== name) {
      continue;
    }

    const value = trimmed.slice(eq + 1).trim();
    return value || null;
  }

  return null;
}

function verifySignedGuestCookie(
  token: string,
  secret: string
): string | null {
  const parts = token.split(".");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const [payloadB64, signatureB64] = parts;
  let provided: Buffer;

  try {
    provided = Buffer.from(signatureB64, "base64url");
  } catch {
    return null;
  }

  const expected = signPayload(payloadB64, secret);

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as { v?: unknown; gid?: unknown };

    if (payload.v !== 1 || typeof payload.gid !== "string") {
      return null;
    }

    if (!GUEST_ID_PATTERN.test(payload.gid)) {
      return null;
    }

    return payload.gid;
  } catch {
    return null;
  }
}

function isLikelyIp(value: string): boolean {
  if (IPV4_PATTERN.test(value)) {
    const octets = value.split(".");
    return octets.every((part) => {
      const n = Number(part);
      return n >= 0 && n <= 255;
    });
  }

  return value.includes(":") && IPV6_PATTERN.test(value);
}

function lastForwardedHop(header: string): string | null {
  const hops = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (let i = hops.length - 1; i >= 0; i -= 1) {
    const hop = hops[i];

    if (hop && isLikelyIp(hop)) {
      return hop;
    }
  }

  return null;
}

/**
 * Guest IP fallback identity. Prefer Vercel-controlled headers.
 * Do not use the leftmost x-forwarded-for hop — clients can prepend spoofed IPs.
 * Raw IPs are never stored; only an HMAC id is used.
 */
function getClientIp(request: Request): string {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");

  if (vercelForwarded) {
    const hop = lastForwardedHop(vercelForwarded);

    if (hop) {
      return hop;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();

  if (realIp && isLikelyIp(realIp)) {
    return realIp;
  }

  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    const hop = lastForwardedHop(forwarded);

    if (hop) {
      return hop;
    }
  }

  return "unknown";
}

function ipGuestId(request: Request, secret: string): string {
  return createHmac("sha256", secret)
    .update(`guest-ip:${getClientIp(request)}`)
    .digest("hex")
    .slice(0, 32);
}

export type GuestIdentity = {
  guestId: string;
  cookieToSet: string | null;
  hadValidCookie: boolean;
  ipGuestId: string;
};

export function resolveGuestIdentity(request: Request): GuestIdentity | null {
  const secret = getGuestUsageSecret();

  if (!secret) {
    return null;
  }

  const hashedIpId = ipGuestId(request, secret);
  const rawCookie = readCookieValue(request, GUEST_ID_COOKIE);

  if (rawCookie) {
    const guestId = verifySignedGuestCookie(rawCookie, secret);

    if (guestId) {
      return {
        guestId,
        cookieToSet: null,
        hadValidCookie: true,
        ipGuestId: hashedIpId,
      };
    }
  }

  const guestId = newGuestId();

  return {
    guestId,
    cookieToSet: signGuestId(guestId, secret),
    hadValidCookie: false,
    ipGuestId: hashedIpId,
  };
}

export function applyGuestIdentityCookie(
  response: NextResponse,
  signedValue: string
): void {
  response.cookies.set({
    name: GUEST_ID_COOKIE,
    value: signedValue,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
  });
}

export function attachGuestCookie(
  response: NextResponse,
  signedValue: string | null | undefined
): NextResponse {
  if (signedValue) {
    applyGuestIdentityCookie(response, signedValue);
  }

  return response;
}
