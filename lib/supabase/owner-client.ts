"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from "./config";

const OWNER_STORAGE_KEY = "easymath-owner-auth";

let ownerClient: SupabaseClient | null = null;

export function getOwnerSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined" || !isSupabaseConfigured()) {
    return null;
  }

  if (ownerClient) {
    return ownerClient;
  }

  const url = getSupabaseUrl();
  const publicKey = getSupabasePublicKey();

  if (!url || !publicKey) {
    return null;
  }

  ownerClient = createClient(url, publicKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: OWNER_STORAGE_KEY,
    },
  });

  return ownerClient;
}
