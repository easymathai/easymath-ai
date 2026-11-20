import { NextResponse } from "next/server";
import { logConsoleAuthEvent } from "@/lib/console-activity";
import {
  AUTH_SESSION_COOKIE,
  sessionCookieOptions,
  tokenMaxAgeSeconds,
} from "@/lib/auth-session-cookie";
import { requireConsoleAccess } from "@/lib/owner";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBearerToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function clearSessionCookie(request: Request, body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.cookies.set(AUTH_SESSION_COOKIE, "", {
    ...sessionCookieOptions(request, 0),
    maxAge: 0,
  });
  return response;
}

async function latestActivity(email: string, event: "sign_in" | "sign_out"): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from("console_auth_activity")
    .select("created_at")
    .eq("email", email)
    .eq("event", event)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("console activity latest lookup failed");
    return null;
  }

  return data?.created_at ?? null;
}

export async function GET(request: Request) {
  const access = await requireConsoleAccess(request);

  if (!access.ok) {
    return access.response;
  }

  const email = (access.auth.user.email || "").trim().toLowerCase();
  const [lastSignInAt, lastSignOutAt] = await Promise.all([
    latestActivity(email, "sign_in"),
    latestActivity(email, "sign_out"),
  ]);

  return NextResponse.json({
    email,
    role: access.auth.role,
    lastSignInAt,
    lastSignOutAt,
  });
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  const access = await requireConsoleAccess(request);

  if (!access.ok || !token) {
    return access.ok ? NextResponse.json({ error: "Not found." }, { status: 404 }) : access.response;
  }

  const email = (access.auth.user.email || "").trim().toLowerCase();
  await logConsoleAuthEvent({
    email,
    role: access.auth.role,
    event: "sign_in",
    request,
  });

  const response = NextResponse.json({
    email,
    role: access.auth.role,
  });
  response.cookies.set(
    AUTH_SESSION_COOKIE,
    token,
    sessionCookieOptions(request, tokenMaxAgeSeconds(token))
  );
  return response;
}

export async function DELETE(request: Request) {
  const access = await requireConsoleAccess(request);

  if (access.ok) {
    const email = (access.auth.user.email || "").trim().toLowerCase();
    await logConsoleAuthEvent({
      email,
      role: access.auth.role,
      event: "sign_out",
      request,
    });
  }

  // Always clear the cookie so Sign out works even if the session already expired.
  return clearSessionCookie(request, { ok: true }, 200);
}
