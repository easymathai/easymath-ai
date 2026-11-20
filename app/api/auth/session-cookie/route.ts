import { NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-session-cookie";
import { getBearerToken, getRequestUser } from "@/lib/supabase/server";

function cookieSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol;
  return proto === "https" || proto === "https:";
}

function sessionCookieOptions(request: Request, maxAge: number) {
  return {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function tokenMaxAgeSeconds(token: string): number {
  try {
    const payload = token.split(".")[1];

    if (!payload) {
      return 60 * 60;
    }

    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };

    if (typeof json.exp === "number") {
      return Math.max(60, json.exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    // Fall through to the default window.
  }

  return 60 * 60;
}

/** Store a signed-in access token in an httpOnly cookie (any signed-in user). */
export async function POST(request: Request) {
  const auth = await getRequestUser(request);

  if (!auth) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  const token = getBearerToken(request) || auth.token;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    AUTH_SESSION_COOKIE,
    token,
    sessionCookieOptions(request, tokenMaxAgeSeconds(token))
  );
  return response;
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_SESSION_COOKIE, "", sessionCookieOptions(request, 0));
  return response;
}
