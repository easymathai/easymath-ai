import { NextResponse } from "next/server";
import { requireConsoleAccess } from "@/lib/owner";
import { parseExpiryDateInput, type UserPlan } from "@/lib/plans";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();

  if (!email || !email.includes("@") || email.length > 320) {
    return null;
  }

  return email;
}

export async function POST(request: Request) {
  const access = await requireConsoleAccess(request);

  if (!access.ok) {
    return access.response;
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

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const planValue = typeof body.plan === "string" ? body.plan.trim().toLowerCase() : "";

  if (!email || (planValue !== "free" && planValue !== "pro")) {
    return NextResponse.json({ error: "Enter a valid email and plan." }, { status: 400 });
  }

  const nextPlan = planValue as UserPlan;
  const expiryInput = parseExpiryDateInput(body.expiresAt);

  if (expiryInput === "invalid") {
    return NextResponse.json({ error: "Enter a valid expiry date." }, { status: 400 });
  }

  const nextExpiresAt =
    nextPlan === "pro" && expiryInput ? expiryInput.toISOString() : null;

  let target: { id: string; email?: string | null } | null = null;
  const perPage = 200;

  for (let page = 1; page <= 50 && !target; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      console.error("owner plan listUsers failed");
      return NextResponse.json({ error: "Unable to update that plan right now." }, { status: 500 });
    }

    const match = (data.users || []).find(
      (user) => (user.email || "").trim().toLowerCase() === email
    );

    if (match) {
      target = { id: match.id, email: match.email || email };
    }

    if ((data.users || []).length < perPage) {
      break;
    }
  }

  if (!target) {
    const { data: profileRows, error: profileLookupError } = await admin
      .from("profiles")
      .select("id, email, plan, plan_expires_at");

    if (profileLookupError) {
      console.error("owner plan profile lookup failed");
      return NextResponse.json({ error: "Unable to update that plan right now." }, { status: 500 });
    }

    const profileMatch = (profileRows || []).find(
      (row: { id: string; email: string | null }) =>
        (row.email || "").trim().toLowerCase() === email
    );

    if (!profileMatch) {
      return NextResponse.json(
        { error: "No EasyMath account with that email." },
        { status: 404 }
      );
    }

    target = { id: profileMatch.id, email: profileMatch.email || email };
  }

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id, email, plan, plan_expires_at")
    .eq("id", target.id)
    .maybeSingle();

  if (existingError) {
    console.error("owner plan load failed");
    return NextResponse.json({ error: "Unable to update that plan right now." }, { status: 500 });
  }

  const fromPlan = existing?.plan === "pro" ? "pro" : "free";
  const fromExpires = existing?.plan_expires_at ?? null;

  const { error: updateError } = await admin.from("profiles").upsert(
    {
      id: target.id,
      email: target.email || email,
      plan: nextPlan,
      plan_expires_at: nextExpiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (updateError) {
    console.error("owner plan update failed");
    return NextResponse.json({ error: "Unable to update that plan right now." }, { status: 500 });
  }

  const { error: auditError } = await admin.from("owner_plan_audit").insert({
    actor_email: access.auth.user.email || "",
    target_user_id: target.id,
    target_email: target.email || email,
    from_plan: fromPlan,
    to_plan: nextPlan,
    from_plan_expires_at: fromExpires,
    to_plan_expires_at: nextExpiresAt,
  });

  if (auditError) {
    console.error("owner plan audit failed");
  }

  return NextResponse.json({
    ok: true,
    email: target.email || email,
    plan: nextPlan,
    planExpiresAt: nextExpiresAt,
  });
}
