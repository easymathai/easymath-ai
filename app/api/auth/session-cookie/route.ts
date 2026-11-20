import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  sessionCookieOptions,
  tokenMaxAgeSeconds,
} from "@/lib/auth-session-cookie";
import { getBearerToken, getRequestUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const token = getBearerToken(request);
  const auth = await getRequestUser(request);

  if (!token || !auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
  response.cookies.set(AUTH_SESSION_COOKIE, "", {
    ...sessionCookieOptions(request, 0),
    maxAge: 0,
  });
  return response;
}
