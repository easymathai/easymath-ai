import { NextResponse } from "next/server";
import { isDeveloperEmail, requireConsoleAccess } from "@/lib/owner";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ActivityRow = {
  id: string;
  email: string;
  role: string;
  event: "sign_in" | "sign_out";
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  const access = await requireConsoleAccess(request);

  if (!access.ok) {
    return access.response;
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Owner tools are temporarily unavailable." }, { status: 503 });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Owner tools are temporarily unavailable." }, { status: 503 });
  }

  const email = (access.auth.user.email || "").trim().toLowerCase();
  const showDeveloper = access.auth.role === "developer";

  const { data, error } = await admin
    .from("console_auth_activity")
    .select("id, email, role, event, ip, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error("console activity list failed");
    return NextResponse.json({ error: "Unable to load sign-in activity right now." }, { status: 500 });
  }

  const events = ((data || []) as ActivityRow[]).filter((row) => {
    if (showDeveloper) {
      return true;
    }

    return !isDeveloperEmail(row.email);
  });

  const mine = events.filter((row) => row.email === email);
  const lastSignInAt = mine.find((row) => row.event === "sign_in")?.created_at ?? null;
  const lastSignOutAt = mine.find((row) => row.event === "sign_out")?.created_at ?? null;

  return NextResponse.json({
    lastSignInAt,
    lastSignOutAt,
    events: events.slice(0, 40).map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      event: row.event,
      ip: row.ip,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    })),
  });
}
