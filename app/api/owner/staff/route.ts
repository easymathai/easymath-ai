import { NextResponse } from "next/server";
import {
  isDeveloperEmail,
  isOwnerEmail,
  requireOwnerOrDeveloper,
} from "@/lib/owner";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type StaffRow = {
  email: string;
  role: string;
  added_by: string;
  created_at: string;
};

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

async function findAuthUserByEmail(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  email: string
) {
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      console.error("console staff listUsers failed");
      return { error: true as const, user: null };
    }

    const match = (data.users || []).find(
      (user) => (user.email || "").trim().toLowerCase() === email
    );

    if (match) {
      return { error: false as const, user: match };
    }

    if ((data.users || []).length < perPage) {
      break;
    }
  }

  return { error: false as const, user: null };
}

function unavailable() {
  return NextResponse.json({ error: "Owner tools are temporarily unavailable." }, { status: 503 });
}

export async function GET(request: Request) {
  const access = await requireOwnerOrDeveloper(request);

  if (!access.ok) {
    return access.response;
  }

  if (!isSupabaseAdminConfigured()) {
    return unavailable();
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return unavailable();
  }

  const { data, error } = await admin
    .from("console_staff")
    .select("email, role, added_by, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("console staff list failed");
    return NextResponse.json({ error: "Unable to load staff right now." }, { status: 500 });
  }

  const staff = ((data || []) as StaffRow[])
    .filter((row) => !isDeveloperEmail(row.email))
    .map((row) => ({
      email: row.email,
      role: "staff" as const,
      addedBy:
        access.auth.role === "developer" || !isDeveloperEmail(row.added_by)
          ? row.added_by
          : "—",
      createdAt: row.created_at,
    }));

  return NextResponse.json({ staff });
}

export async function POST(request: Request) {
  const access = await requireOwnerOrDeveloper(request);

  if (!access.ok) {
    return access.response;
  }

  if (!isSupabaseAdminConfigured()) {
    return unavailable();
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return unavailable();
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);

  if (!email) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  if (isDeveloperEmail(email) || isOwnerEmail(email)) {
    return NextResponse.json({ error: "That account cannot be added as staff." }, { status: 400 });
  }

  const found = await findAuthUserByEmail(admin, email);

  if (found.error) {
    return NextResponse.json({ error: "Unable to add staff right now." }, { status: 500 });
  }

  if (!found.user) {
    return NextResponse.json({ error: "No EasyMath account with that email." }, { status: 404 });
  }

  if (!found.user.email_confirmed_at) {
    return NextResponse.json({ error: "That EasyMath account has not confirmed its email yet." }, { status: 400 });
  }

  const actorEmail = (access.auth.user.email || "").trim().toLowerCase();

  const { error: insertError } = await admin.from("console_staff").insert({
    email,
    role: "staff",
    added_by: actorEmail,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "That email is already on the staff list." }, { status: 400 });
    }

    console.error("console staff insert failed");
    return NextResponse.json({ error: "Unable to add staff right now." }, { status: 500 });
  }

  const { error: auditError } = await admin.from("console_staff_audit").insert({
    actor_email: actorEmail,
    actor_role: access.auth.role,
    action: "add_staff",
    target_email: email,
  });

  if (auditError) {
    console.error("console staff audit failed");
  }

  return NextResponse.json({ ok: true, email });
}

export async function DELETE(request: Request) {
  const access = await requireOwnerOrDeveloper(request);

  if (!access.ok) {
    return access.response;
  }

  if (!isSupabaseAdminConfigured()) {
    return unavailable();
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return unavailable();
  }

  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const email =
    normalizeEmail(body.email) ||
    normalizeEmail(new URL(request.url).searchParams.get("email"));

  if (!email) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  if (isDeveloperEmail(email)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: existing, error: existingError } = await admin
    .from("console_staff")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    console.error("console staff remove lookup failed");
    return NextResponse.json({ error: "Unable to remove staff right now." }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "That email is not on the staff list." }, { status: 404 });
  }

  const { error: deleteError } = await admin.from("console_staff").delete().eq("email", email);

  if (deleteError) {
    console.error("console staff delete failed");
    return NextResponse.json({ error: "Unable to remove staff right now." }, { status: 500 });
  }

  const actorEmail = (access.auth.user.email || "").trim().toLowerCase();
  const { error: auditError } = await admin.from("console_staff_audit").insert({
    actor_email: actorEmail,
    actor_role: access.auth.role,
    action: "remove_staff",
    target_email: email,
  });

  if (auditError) {
    console.error("console staff audit failed");
  }

  return NextResponse.json({ ok: true, email });
}
