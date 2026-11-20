import type { ConsoleRole } from "@/lib/owner";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function requestClientIp(request: Request): string | null {
  const raw =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-real-ip");

  if (!raw) {
    return null;
  }

  return raw.split(",")[0]?.trim().slice(0, 128) || null;
}

export function requestUserAgent(request: Request): string | null {
  const ua = request.headers.get("user-agent");

  if (!ua) {
    return null;
  }

  return ua.slice(0, 500);
}

export async function logConsoleAuthEvent(params: {
  email: string;
  role: ConsoleRole;
  event: "sign_in" | "sign_out";
  request: Request;
}): Promise<void> {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return;
  }

  const { error } = await admin.from("console_auth_activity").insert({
    email: params.email.trim().toLowerCase(),
    role: params.role,
    event: params.event,
    ip: requestClientIp(params.request),
    user_agent: requestUserAgent(params.request),
  });

  if (error) {
    console.error("console auth activity insert failed");
  }
}
