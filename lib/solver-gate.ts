import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DAILY_LIMIT_MESSAGE, FREE_DAILY_SOLVER_LIMIT } from "./constants";
import {
  getDailySolverLimitForPlan,
  getPlanDisplayName,
  type UserPlan,
} from "./plans";
import {
  claimSolverUsage,
  getRequestUser,
  getUserPlanFromProfile,
  releaseSolverUsage,
  type ClaimUsageResult,
} from "./supabase/server";

export { DAILY_LIMIT_MESSAGE };

export type SolverGateSuccess = {
  ok: true;
  usage: ClaimUsageResult | null;
  authed: boolean;
  claimed: boolean;
  plan: UserPlan;
  supabase: SupabaseClient | null;
};

export type SolverGateFailure = {
  ok: false;
  response: NextResponse;
};

/**
 * Reserve one Free-plan solver credit for a logged-in Free user (atomic FOR UPDATE).
 * Pro users skip claiming and are never blocked by the daily Free limit.
 * Guests are not claimed here — the client uses localStorage.
 * Call releaseSolverReservation() if the solve fails after a successful claim.
 */
export async function enforceLoggedInSolverLimit(
  request: Request
): Promise<SolverGateSuccess | SolverGateFailure> {
  const auth = await getRequestUser(request);

  // Guests: client enforces localStorage limit. Server cannot identify them.
  if (!auth) {
    return {
      ok: true,
      usage: null,
      authed: false,
      claimed: false,
      plan: "free",
      supabase: null,
    };
  }

  const plan = await getUserPlanFromProfile(auth.supabase, auth.user.id);
  const planLimit = getDailySolverLimitForPlan(plan);

  // Pro (and future unlimited plans): skip daily Free-plan claim entirely.
  if (planLimit === null) {
    return {
      ok: true,
      usage: null,
      authed: true,
      claimed: false,
      plan,
      supabase: auth.supabase,
    };
  }

  const usage = await claimSolverUsage(auth.supabase);

  if (!usage) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "We couldn't verify your Free plan usage right now. Please try again in a moment.",
        },
        { status: 503 }
      ),
    };
  }

  if (!usage.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: DAILY_LIMIT_MESSAGE,
          code: "DAILY_LIMIT_REACHED",
          plan,
          planLabel: getPlanDisplayName(plan),
          usage: {
            used: usage.used,
            limit: usage.limit || planLimit || FREE_DAILY_SOLVER_LIMIT,
            unlimited: false,
          },
        },
        { status: 429 }
      ),
    };
  }

  return {
    ok: true,
    usage,
    authed: true,
    claimed: true,
    plan,
    supabase: auth.supabase,
  };
}

export async function releaseSolverReservation(
  gate: SolverGateSuccess
): Promise<void> {
  if (!gate.claimed || !gate.supabase) {
    return;
  }

  await releaseSolverUsage(gate.supabase);
}
