import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DAILY_LIMIT_MESSAGE, FREE_DAILY_SOLVER_LIMIT } from "./constants";
import { getDailySolverLimitForPlan, resolveUserPlan } from "./plans";
import {
  claimSolverUsage,
  getRequestUser,
  releaseSolverUsage,
  type ClaimUsageResult,
} from "./supabase/server";

export { DAILY_LIMIT_MESSAGE };

export type SolverGateSuccess = {
  ok: true;
  usage: ClaimUsageResult | null;
  authed: boolean;
  claimed: boolean;
  supabase: SupabaseClient | null;
};

export type SolverGateFailure = {
  ok: false;
  response: NextResponse;
};

/**
 * Reserve one Free-plan solver credit for a logged-in user (atomic FOR UPDATE).
 * Guests are not claimed here — the client uses localStorage.
 * Call releaseSolverReservation() if the solve fails after a successful claim.
 */
export async function enforceLoggedInSolverLimit(
  request: Request
): Promise<SolverGateSuccess | SolverGateFailure> {
  const auth = await getRequestUser(request);

  // Guests: client enforces localStorage limit. Server cannot identify them.
  if (!auth) {
    return { ok: true, usage: null, authed: false, claimed: false, supabase: null };
  }

  const plan = resolveUserPlan();
  const planLimit = getDailySolverLimitForPlan(plan);

  // Future paid plans with null limit skip daily enforcement.
  if (planLimit === null) {
    return {
      ok: true,
      usage: null,
      authed: true,
      claimed: false,
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
          usage: {
            used: usage.used,
            limit: usage.limit || planLimit || FREE_DAILY_SOLVER_LIMIT,
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
