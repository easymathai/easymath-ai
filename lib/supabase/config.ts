export function getSupabaseUrl(): string | undefined {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return value || undefined;
}

/**
 * Public client key for browser + authenticated user JWT requests.
 * Prefer the current Publishable key (sb_publishable_...).
 * Legacy anon JWT (NEXT_PUBLIC_SUPABASE_ANON_KEY) remains supported as fallback.
 * Never use the Secret / service_role key here.
 */
export function getSupabasePublicKey(): string | undefined {
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (publishable) {
    return publishable;
  }

  const legacyAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return legacyAnon || undefined;
}

/** @deprecated Use getSupabasePublicKey() */
export function getSupabaseAnonKey(): string | undefined {
  return getSupabasePublicKey();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabasePublicKey());
}
