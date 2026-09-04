import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { resolveUserPlan, type UserPlan } from "../plans";
import { getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from "./config";

export function createSupabaseUserClient(accessToken: string): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const url = getSupabaseUrl();
  const publicKey = getSupabasePublicKey();

  if (!url || !publicKey || !accessToken.trim()) {
    return null;
  }

  return createClient(url, publicKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** Public-key client with no user JWT. Used only for secret-gated guest usage RPCs. */
export function createSupabaseAnonClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const url = getSupabaseUrl();
  const publicKey = getSupabasePublicKey();

  if (!url || !publicKey) {
    return null;
  }

  return createClient(url, publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");

  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getRequestUser(
  request: Request
): Promise<{ user: User; token: string; supabase: SupabaseClient } | null> {
  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  const supabase = createSupabaseUserClient(token);

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return { user: data.user, token, supabase };
}

/**
 * Read plan from the authenticated user's profile row (server-trusted).
 * Never accept plan from client request bodies.
 */
export async function getUserPlanFromProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPlan> {
  const { data, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("getUserPlanFromProfile error:", error);
    return "free";
  }

  return resolveUserPlan(data?.plan);
}

export type ClaimUsageResult = {
  allowed: boolean;
  used: number;
  limit: number;
};

function parseUsagePayload(data: unknown): ClaimUsageResult {
  const payload = (data || {}) as {
    allowed?: boolean;
    used?: number;
    limit?: number;
  };

  return {
    allowed: Boolean(payload.allowed),
    used: Number(payload.used) || 0,
    limit: Number(payload.limit) || 10,
  };
}

export async function claimSolverUsage(
  supabase: SupabaseClient
): Promise<ClaimUsageResult | null> {
  const { data, error } = await supabase.rpc("claim_solver_usage");

  if (error || !data) {
    console.error("claim_solver_usage error:", error);
    return null;
  }

  return parseUsagePayload(data);
}

export async function releaseSolverUsage(
  supabase: SupabaseClient
): Promise<ClaimUsageResult | null> {
  const { data, error } = await supabase.rpc("release_solver_usage");

  if (error || !data) {
    console.error("release_solver_usage error:", error);
    return null;
  }

  return parseUsagePayload(data);
}

export async function getSolverUsage(
  supabase: SupabaseClient
): Promise<{ used: number; limit: number } | null> {
  const { data, error } = await supabase.rpc("get_solver_usage");

  if (error || !data) {
    console.error("get_solver_usage error:", error);
    return null;
  }

  const parsed = parseUsagePayload(data);
  return {
    used: parsed.used,
    limit: parsed.limit,
  };
}

async function callGuestUsageRpc(
  fn: "get_guest_solver_usage" | "claim_guest_solver_usage" | "release_guest_solver_usage",
  guestId: string,
  secret: string,
  ipGuestId?: string | null
): Promise<ClaimUsageResult | null> {
  const supabase = createSupabaseAnonClient();

  if (!supabase) {
    return null;
  }

  const args: Record<string, string> = {
    p_guest_id: guestId,
    p_secret: secret,
  };

  if (ipGuestId) {
    args.p_ip_id = ipGuestId;
  }

  const { data, error } = await supabase.rpc(fn, args);

  if (error || !data) {
    console.error(`${fn} error:`, error);
    return null;
  }

  return parseUsagePayload(data);
}

export async function getGuestSolverUsage(
  guestId: string,
  secret: string
): Promise<{ used: number; limit: number } | null> {
  const parsed = await callGuestUsageRpc(
    "get_guest_solver_usage",
    guestId,
    secret
  );

  if (!parsed) {
    return null;
  }

  return {
    used: parsed.used,
    limit: parsed.limit,
  };
}

export async function claimGuestSolverUsage(
  guestId: string,
  secret: string,
  ipGuestId?: string | null
): Promise<ClaimUsageResult | null> {
  return callGuestUsageRpc(
    "claim_guest_solver_usage",
    guestId,
    secret,
    ipGuestId
  );
}

export async function releaseGuestSolverUsage(
  guestId: string,
  secret: string,
  ipGuestId?: string | null
): Promise<ClaimUsageResult | null> {
  return callGuestUsageRpc(
    "release_guest_solver_usage",
    guestId,
    secret,
    ipGuestId
  );
}
