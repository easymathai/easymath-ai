/** HttpOnly cookie used so server routes can see a signed-in session. */
export const AUTH_SESSION_COOKIE = "ema_session";

export function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");

    if (eq <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();

    if (key !== name) {
      continue;
    }

    try {
      return decodeURIComponent(trimmed.slice(eq + 1).trim());
    } catch {
      return trimmed.slice(eq + 1).trim() || null;
    }
  }

  return null;
}
