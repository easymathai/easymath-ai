import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./config";

/**
 * Server-only Supabase admin client.
 * Never import this module from client components.
 * Never expose SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY via NEXT_PUBLIC_.
 */
export function getSupabaseAdminSecret(): string | undefined {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (secretKey) {
    return secretKey;
  }

  const legacyServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return legacyServiceRoleKey || undefined;
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAdminSecret());
}

export function createSupabaseAdminClient(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error("Supabase admin client is server-only.");
  }

  const url = getSupabaseUrl();
  const adminSecret = getSupabaseAdminSecret();

  if (!url || !adminSecret) {
    return null;
  }

  return createClient(url, adminSecret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
