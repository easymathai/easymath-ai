import { NextResponse } from "next/server";
import { createSupabaseUserClient, getRequestUser, type RequestUser } from "./supabase/server";

/**
 * Server-only owner check. Do not import this module from client components.
 * Owner emails are never sent to the browser.
 */
const DEFAULT_OWNER_EMAILS = "hello@zayir.ai";

export function getOwnerEmails(): string[] {
  const raw = process.env.OWNER_EMAILS?.trim() || DEFAULT_OWNER_EMAILS;

  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email?: string | null): boolean {
  if (!email) {
    return false;
  }

  return getOwnerEmails().includes(email.trim().toLowerCase());
}

export function isEmailConfirmed(user: { email_confirmed_at?: string | null }): boolean {
  return Boolean(user.email_confirmed_at);
}

export function ownerNotFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export type OwnerAuth = RequestUser;

export async function requireOwner(
  request: Request
): Promise<{ ok: true; auth: OwnerAuth } | { ok: false; response: NextResponse }> {
  const auth = await getRequestUser(request);

  if (!auth || !isEmailConfirmed(auth.user) || !isOwnerEmail(auth.user.email)) {
    return { ok: false, response: ownerNotFoundResponse() };
  }

  return { ok: true, auth };
}

export async function isOwnerAccessToken(token?: string | null): Promise<boolean> {
  if (!token) {
    return false;
  }

  const supabase = createSupabaseUserClient(token);

  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return false;
  }

  return isEmailConfirmed(data.user) && isOwnerEmail(data.user.email);
}
