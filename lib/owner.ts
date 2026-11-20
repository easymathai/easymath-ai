import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseUserClient, getRequestUser, type RequestUser } from "./supabase/server";

/**
 * Server-only console authorization. Do not import this module from client components.
 * Owner and developer emails are never sent to the browser except as the signed-in user.
 */
const DEFAULT_OWNER_EMAILS = "hello@zayir.ai";
const DEFAULT_DEVELOPER_EMAILS = "hello@zayir.ai";

export type ConsoleRole = "developer" | "owner" | "staff";

export type ConsoleAuth = RequestUser & { role: ConsoleRole };

function parseEmailList(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getOwnerEmails(): string[] {
  return parseEmailList(process.env.OWNER_EMAILS?.trim() || DEFAULT_OWNER_EMAILS);
}

export function getDeveloperEmails(): string[] {
  return parseEmailList(process.env.DEVELOPER_EMAILS?.trim() || DEFAULT_DEVELOPER_EMAILS);
}

export function isOwnerEmail(email?: string | null): boolean {
  if (!email) {
    return false;
  }

  return getOwnerEmails().includes(email.trim().toLowerCase());
}

export function isDeveloperEmail(email?: string | null): boolean {
  if (!email) {
    return false;
  }

  return getDeveloperEmails().includes(email.trim().toLowerCase());
}

export function isEmailConfirmed(user: { email_confirmed_at?: string | null }): boolean {
  return Boolean(user.email_confirmed_at);
}

export function ownerNotFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

function normalizeEmail(email?: string | null): string | null {
  const value = (email || "").trim().toLowerCase();
  return value && value.includes("@") ? value : null;
}

async function isStaffEmail(email: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return false;
  }

  const { data, error } = await admin
    .from("console_staff")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("console staff lookup failed");
    return false;
  }

  return Boolean(data);
}

export async function resolveConsoleRole(email?: string | null): Promise<ConsoleRole | null> {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return null;
  }

  // Developer wins when an email is listed in more than one source.
  if (isDeveloperEmail(normalized)) {
    return "developer";
  }

  if (isOwnerEmail(normalized)) {
    return "owner";
  }

  if (await isStaffEmail(normalized)) {
    return "staff";
  }

  return null;
}

export async function requireConsoleAccess(
  request: Request
): Promise<{ ok: true; auth: ConsoleAuth } | { ok: false; response: NextResponse }> {
  const auth = await getRequestUser(request);

  if (!auth || !isEmailConfirmed(auth.user)) {
    return { ok: false, response: ownerNotFoundResponse() };
  }

  const role = await resolveConsoleRole(auth.user.email);

  if (!role) {
    return { ok: false, response: ownerNotFoundResponse() };
  }

  return { ok: true, auth: { ...auth, role } };
}

export async function requireOwnerOrDeveloper(
  request: Request
): Promise<{ ok: true; auth: ConsoleAuth } | { ok: false; response: NextResponse }> {
  const access = await requireConsoleAccess(request);

  if (!access.ok) {
    return access;
  }

  if (access.auth.role === "staff") {
    return { ok: false, response: ownerNotFoundResponse() };
  }

  return access;
}

export async function requireDeveloper(
  request: Request
): Promise<{ ok: true; auth: ConsoleAuth } | { ok: false; response: NextResponse }> {
  const access = await requireConsoleAccess(request);

  if (!access.ok) {
    return access;
  }

  if (access.auth.role !== "developer") {
    return { ok: false, response: ownerNotFoundResponse() };
  }

  return access;
}

/** @deprecated Prefer requireConsoleAccess. Kept for older call sites that grant Pro. */
export async function requireOwner(
  request: Request
): Promise<{ ok: true; auth: ConsoleAuth } | { ok: false; response: NextResponse }> {
  return requireConsoleAccess(request);
}

export async function getConsoleRoleFromToken(token?: string | null): Promise<ConsoleRole | null> {
  if (!token) {
    return null;
  }

  const supabase = createSupabaseUserClient(token);

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user || !isEmailConfirmed(data.user)) {
    return null;
  }

  return resolveConsoleRole(data.user.email);
}

export async function isOwnerAccessToken(token?: string | null): Promise<boolean> {
  return Boolean(await getConsoleRoleFromToken(token));
}

export async function isConsoleAccessToken(token?: string | null): Promise<boolean> {
  return Boolean(await getConsoleRoleFromToken(token));
}
