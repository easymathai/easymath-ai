export const AUTH_SESSION_COOKIE = "ema_session";

export function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");

  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split("=");

    if (rawName === name) {
      return rest.join("=") || null;
    }
  }

  return null;
}

export function cookieSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol;
  return proto === "https" || proto === "https:";
}

export function sessionCookieOptions(request: Request, maxAge: number) {
  return {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function tokenMaxAgeSeconds(token: string): number {
  try {
    const payloadPart = token.split(".")[1];

    if (!payloadPart) {
      return 60 * 60 * 24 * 7;
    }

    const padded = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as { exp?: number };
    const exp = typeof payload.exp === "number" ? payload.exp : 0;
    const seconds = exp - Math.floor(Date.now() / 1000);
    return seconds > 60 ? seconds : 60 * 60 * 24 * 7;
  } catch {
    return 60 * 60 * 24 * 7;
  }
}
