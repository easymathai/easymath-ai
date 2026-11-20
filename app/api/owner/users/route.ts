import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/owner";
import { isProExpiryPassed, resolveUserPlan } from "@/lib/plans";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  email: string | null;
  plan: string | null;
  plan_expires_at: string | null;
};

export async function GET(request: Request) {
  const owner = await requireOwner(request);

  if (!owner.ok) {
    return owner.response;
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Owner tools are temporarily unavailable." },
      { status: 503 }
    );
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Owner tools are temporarily unavailable." },
      { status: 503 }
    );
  }

  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";

  const authUsers: Array<{
    id: string;
    email?: string;
    email_confirmed_at?: string | null;
    last_sign_in_at?: string | null;
  }> = [];

  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      console.error("owner listUsers failed");
      return NextResponse.json(
        { error: "Unable to load users right now." },
        { status: 500 }
      );
    }

    authUsers.push(...(data.users || []));

    if ((data.users || []).length < perPage) {
      break;
    }
  }

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, email, plan, plan_expires_at");

  if (profileError) {
    console.error("owner profiles list failed");
    return NextResponse.json(
      { error: "Unable to load users right now." },
      { status: 500 }
    );
  }

  const profileById = new Map<string, ProfileRow>(
    ((profiles || []) as ProfileRow[]).map((row) => [row.id, row])
  );

  const users = authUsers
    .map((user) => {
      const profile = profileById.get(user.id);
      const email = (user.email || profile?.email || "").trim();
      const storedPlan = profile?.plan === "pro" ? "pro" : "free";
      const planExpiresAt = profile?.plan_expires_at ?? null;
      const effectivePlan = resolveUserPlan(storedPlan, planExpiresAt);

      return {
        email,
        plan: effectivePlan,
        storedPlan,
        planExpiresAt,
        expired: storedPlan === "pro" && isProExpiryPassed(planExpiresAt),
        confirmed: Boolean(user.email_confirmed_at),
        lastSignInAt: user.last_sign_in_at ?? null,
      };
    })
    .filter((user) => user.email)
    .filter((user) => (query ? user.email.toLowerCase().includes(query) : true))
    .sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({ users });
}
