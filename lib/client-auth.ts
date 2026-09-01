import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase/client";
import { isSupabaseConfigured } from "./supabase/config";

export function cloudAccountsAvailable(): boolean {
  return isSupabaseConfigured();
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function authHeaders(
  extra?: HeadersInit
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    ...(extra as Record<string, string>),
  };

  const token = await getAccessToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export type AuthState = {
  user: User | null;
  session: Session | null;
};

export async function readAuthState(): Promise<AuthState> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return { user: null, session: null };
  }

  const { data } = await supabase.auth.getSession();
  return {
    user: data.session?.user ?? null,
    session: data.session ?? null,
  };
}
