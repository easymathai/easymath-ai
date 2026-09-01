import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from "./config";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (browserClient) {
    return browserClient;
  }

  const url = getSupabaseUrl();
  const publicKey = getSupabasePublicKey();

  if (!url || !publicKey) {
    return null;
  }

  browserClient = createClient(url, publicKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}
