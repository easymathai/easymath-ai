import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DAILY_LIMIT_MESSAGE, FREE_DAILY_SOLVER_LIMIT } from "./constants";
import {
  attachGuestCookie,
  getGuestUsageSecret,
  resolveGuestIdentity,
} from "./guest-identity";
import {
  getDailySolverLimitForPlan,
  getPlanDisplayName,
  type UserPlan,
} from "./plans";
import {
  claimGuestSolverUsage,
  claimSolverUsage,
  commitSolverUsage,
  getRequestUser,
  getUserPlanFromProfile,
  releaseGuestSolverUsage,
  releaseSolverUsage,
  type ClaimUsageResult,
} from "./supabase/server";

export { DAILY_LIMIT_MESSAGE };

function toPublicUsage(usage: ClaimUsageResult): ClaimUsageResult {
  return {
    allowed: usage.allowed,
    used: usage.used,
    limit: usage.limit,
  };
}

export type SolverGateSuccess = {
  ok: true;
  usage: ClaimUsageResult | null;
  reservationId: string | null;
  authed: boolean;
  claimed: boolean;
  plan: UserPlan;
  supabase: SupabaseClient | null;
  guestId: string | null;
  guestCookieToSet: string | null;
  guestIpId: string | null;
};

export type SolverGateFailure = {
  ok: false;
  response: NextResponse;
};

function guestLimitResponse(
  usage: ClaimUsageResult,
  cookieToSet: string | null
): SolverGateFailure {
  return {
    ok: false,
    response: attachGuestCookie(
      NextResponse.json(
        {
          error: DAILY_LIMIT_MESSAGE,
          code: "DAILY_LIMIT_REACHED",
          plan: "free",
          planLabel: getPlanDisplayName("free"),
          usage: {
            used: usage.used,
            limit: usage.limit || FREE_DAILY_SOLVER_LIMIT,
            unlimited: false,
          },
        },
        { status: 429 }
      ),
      cookieToSet
    ),
  };
}

function guestUnavailableResponse(
  cookieToSet: string | null
): SolverGateFailure {
  return {
    ok: false,
    response: attachGuestCookie(
      NextResponse.json(
        {
          error:
            "We couldn't verify your Free plan usage right now. Please try again in a moment.",
        },
        { status: 503 }
      ),
      cookieToSet
    ),
  };
}

/**
 * Reserve one solver credit for a logged-in Free user, or for a guest.
 * Pro users skip claiming and are never blocked by the daily Free limit.
 * Guests are identified by a signed HTTP-only cookie (not request body).
 * Call releaseSolverReservation() if the solve fails before a valid solution.
 * After a valid solution, call commitSolverReservation() and never release.
 */
export async function enforceLoggedInSolverLimit(
  request: Request
): Promise<SolverGateSuccess | SolverGateFailure> {
  const auth = await getRequestUser(request);

  if (auth) {
    const plan = await getUserPlanFromProfile(auth.supabase, auth.user.id);
    const planLimit = getDailySolverLimitForPlan(plan);

    // Pro (and future unlimited plans): skip daily Free-plan claim entirely.
    if (planLimit === null) {
      return {
        ok: true,
        usage: null,
        reservationId: null,
        authed: true,
        claimed: false,
        plan,
        supabase: auth.supabase,
        guestId: null,
        guestCookieToSet: null,
        guestIpId: null,
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

    if (!usage.reservationId) {
      console.error("claim_solver_usage allowed without reservation_id");
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

    return {
      ok: true,
      usage: toPublicUsage(usage),
      reservationId: usage.reservationId,
      authed: true,
      claimed: true,
      plan,
      supabase: auth.supabase,
      guestId: null,
      guestCookieToSet: null,
      guestIpId: null,
    };
  }

  const identity = resolveGuestIdentity(request);
  const secret = getGuestUsageSecret();

  if (!identity || !secret) {
    return guestUnavailableResponse(identity?.cookieToSet ?? null);
  }

  const ipGuestId = identity.hadValidCookie ? null : identity.ipGuestId;
  const usage = await claimGuestSolverUsage(
    identity.guestId,
    secret,
    ipGuestId
  );

  if (!usage) {
    return guestUnavailableResponse(identity.cookieToSet);
  }

  if (!usage.allowed) {
    return guestLimitResponse(usage, identity.cookieToSet);
  }

  return {
    ok: true,
    usage,
    reservationId: null,
    authed: false,
    claimed: true,
    plan: "free",
    supabase: null,
    guestId: identity.guestId,
    guestCookieToSet: identity.cookieToSet,
    guestIpId: ipGuestId,
  };
}

export async function releaseSolverReservation(
  gate: SolverGateSuccess
): Promise<void> {
  if (!gate.claimed) {
    return;
  }

  if (gate.supabase) {
    if (!gate.reservationId) {
      console.error("releaseSolverReservation skipped: missing reservation id");
      return;
    }

    await releaseSolverUsage(gate.supabase, gate.reservationId);
    return;
  }

  const secret = getGuestUsageSecret();

  if (!secret || !gate.guestId) {
    return;
  }

  await releaseGuestSolverUsage(gate.guestId, secret, gate.guestIpId);
}

export async function commitSolverReservation(
  gate: SolverGateSuccess
): Promise<void> {
  if (!gate.claimed || !gate.supabase || !gate.reservationId) {
    return;
  }

  try {
    await commitSolverUsage(gate.supabase, gate.reservationId);
  } catch (error) {
    console.error("commitSolverReservation error:", error);
  }
}
