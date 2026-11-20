import { NextResponse } from "next/server";
import packageJson from "@/package.json";
import { requireDeveloper } from "@/lib/owner";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function supabaseProjectId(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  try {
    const host = new URL(raw).hostname;
    const id = host.split(".")[0]?.trim();
    return id || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const access = await requireDeveloper(request);

  if (!access.ok) {
    return access.response;
  }

  const env = {
    appVersion: packageJson.version || "0.1.0",
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    commitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
    vercelEnv: process.env.VERCEL_ENV || null,
    supabaseProjectId: supabaseProjectId(),
  };

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ...env, audits: { plan: [], staff: [], auth: [] } });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ ...env, audits: { plan: [], staff: [], auth: [] } });
  }

  const [plan, staff, auth] = await Promise.all([
    admin
      .from("owner_plan_audit")
      .select("id, actor_email, target_email, from_plan, to_plan, from_plan_expires_at, to_plan_expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("console_staff_audit")
      .select("id, actor_email, actor_role, action, target_email, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("console_auth_activity")
      .select("id, email, role, event, ip, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (plan.error) {
    console.error("developer plan audit lookup failed");
  }

  if (staff.error) {
    console.error("developer staff audit lookup failed");
  }

  if (auth.error) {
    console.error("developer auth audit lookup failed");
  }

  return NextResponse.json({
    ...env,
    audits: {
      plan: plan.data || [],
      staff: staff.data || [],
      auth: auth.data || [],
    },
  });
}
