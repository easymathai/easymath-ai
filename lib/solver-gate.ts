import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  DAILY_LIMIT_MESSAGE,
  FREE_DAILY_PHOTO_SOLVE_LIMIT,
  FREE_DAILY_SOLVER_LIMIT,
  PHOTO_LIMIT_MESSAGE,
} from "./constants";
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
  getGuestSolverUsage,
  getRequestUser,
  getSolverUsage,
  getUserPlanFromProfile,
  releaseGuestSolverUsage,
  releaseSolverUsage,
  type ClaimUsageResult,
  type UsageLimitCode,
} from "./supabase/server";

export { DAILY_LIMIT_MESSAGE, PHOTO_LIMIT_MESSAGE };

export type SolverGateOptions = {
  /** True when this solve comes from a photo upload/scan (or a confirmed photo read). */
  isPhoto?: boolean;
  /** Check limits without incrementing (free photo read). */
  checkOnly?: boolean;
};

function toPublicUsage(usage: ClaimUsageResult): ClaimUsageResult {
  return {
    allowed: usage.allowed,
    used: usage.used,
    limit: usage.limit,
    photoUsed: usage.photoUsed,
    photoLimit: usage.photoLimit,
    code: usage.code,
  };
}

function limitErrorMessage(code?: UsageLimitCode): string {
  return code === "PHOTO_LIMIT_REACHED"
    ? PHOTO_LIMIT_MESSAGE
    : DAILY_LIMIT_MESSAGE;
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
  isPhoto: boolean;
};

export type SolverGateFailure = {
  ok: false;
  response: NextResponse;
};

function usageJson(
  usage: {
    used: number;
    limit: number;
    photoUsed?: number;
    photoLimit?: number;
  },
  plan: UserPlan,
  code: UsageLimitCode
) {
  return {
    error: limitErrorMessage(code),
    code,
    plan,
    planLabel: getPlanDisplayName(plan),
    usage: {
      used: usage.used,
      limit: usage.limit || FREE_DAILY_SOLVER_LIMIT,
      photoUsed: usage.photoUsed || 0,
      photoLimit: usage.photoLimit || FREE_DAILY_PHOTO_SOLVE_LIMIT,
      unlimited: false,
    },
  };
}

function guestLimitResponse(
  usage: ClaimUsageResult,
  cookieToSet: string | null
): SolverGateFailure {
  const code: UsageLimitCode =
    usage.code === "PHOTO_LIMIT_REACHED"
      ? "PHOTO_LIMIT_REACHED"
      : "DAILY_LIMIT_REACHED";

  return {
    ok: false,
    response: attachGuestCookie(
      NextResponse.json(usageJson(usage, "free", code), { status: 429 }),
      cookieToSet
    ),
  };
}

function signedInLimitResponse(
  usage: ClaimUsageResult,
  plan: UserPlan,
  planLimit: number | null
): SolverGateFailure {
  const code: UsageLimitCode =
    usage.code === "PHOTO_LIMIT_REACHED"
      ? "PHOTO_LIMIT_REACHED"
      : "DAILY_LIMIT_REACHED";

  return {
    ok: false,
    response: NextResponse.json(
      usageJson(
        {
          used: usage.used,
          limit: usage.limit || planLimit || FREE_DAILY_SOLVER_LIMIT,
          photoUsed: usage.photoUsed,
          photoLimit: usage.photoLimit,
        },
        plan,
        code
      ),
      { status: 429 }
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

function checkUsageAllowed(
  usage: {
    used: number;
    limit: number;
    photoUsed: number;
    photoLimit: number;
  },
  isPhoto: boolean
): UsageLimitCode | null {
  if (usage.used >= (usage.limit || FREE_DAILY_SOLVER_LIMIT)) {
    return "DAILY_LIMIT_REACHED";
  }
  if (
    isPhoto &&
    usage.photoUsed >= (usage.photoLimit || FREE_DAILY_PHOTO_SOLVE_LIMIT)
  ) {
    return "PHOTO_LIMIT_REACHED";
  }
  return null;
}

/**
 * Reserve one solver credit for a logged-in Free user, or for a guest.
 * Pro users skip claiming and are never blocked by the daily Free limit.
 * Photo solves also consume the daily photo cap (1 per day on Free/guest).
 * Guests are identified by a signed HTTP-only cookie (not request body).
 * Call releaseSolverReservation() if the solve fails before a valid solution.
 * After a valid solution, call commitSolverReservation() and never release.
 */
export async function enforceLoggedInSolverLimit(
  request: Request,
  options: SolverGateOptions = {}
): Promise<SolverGateSuccess | SolverGateFailure> {
  const isPhoto = Boolean(options.isPhoto);
  const checkOnly = Boolean(options.checkOnly);
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
        isPhoto,
      };
    }

    if (checkOnly) {
      const usage = await getSolverUsage(auth.supabase);

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

      const blocked = checkUsageAllowed(usage, isPhoto);
      if (blocked) {
        return signedInLimitResponse(
          {
            allowed: false,
            used: usage.used,
            limit: usage.limit || planLimit || FREE_DAILY_SOLVER_LIMIT,
            photoUsed: usage.photoUsed,
            photoLimit: usage.photoLimit,
            code: blocked,
          },
          plan,
          planLimit
        );
      }

      return {
        ok: true,
        usage: {
          allowed: true,
          used: usage.used,
          limit: usage.limit,
          photoUsed: usage.photoUsed,
          photoLimit: usage.photoLimit,
        },
        reservationId: null,
        authed: true,
        claimed: false,
        plan,
        supabase: auth.supabase,
        guestId: null,
        guestCookieToSet: null,
        guestIpId: null,
        isPhoto,
      };
    }

    const usage = await claimSolverUsage(auth.supabase, isPhoto);

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
      return signedInLimitResponse(usage, plan, planLimit);
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
      isPhoto,
    };
  }

  const identity = resolveGuestIdentity(request);
  const secret = getGuestUsageSecret();

  if (!identity || !secret) {
    return guestUnavailableResponse(identity?.cookieToSet ?? null);
  }

  const ipGuestId = identity.hadValidCookie ? null : identity.ipGuestId;

  if (checkOnly) {
    const usage = await getGuestSolverUsage(identity.guestId, secret);

    if (!usage) {
      return guestUnavailableResponse(identity.cookieToSet);
    }

    const blocked = checkUsageAllowed(usage, isPhoto);
    if (blocked) {
      return guestLimitResponse(
        {
          allowed: false,
          used: usage.used,
          limit: usage.limit || FREE_DAILY_SOLVER_LIMIT,
          photoUsed: usage.photoUsed,
          photoLimit: usage.photoLimit,
          code: blocked,
        },
        identity.cookieToSet
      );
    }

    return {
      ok: true,
      usage: {
        allowed: true,
        used: usage.used,
        limit: usage.limit,
        photoUsed: usage.photoUsed,
        photoLimit: usage.photoLimit,
      },
      reservationId: null,
      authed: false,
      claimed: false,
      plan: "free",
      supabase: null,
      guestId: identity.guestId,
      guestCookieToSet: identity.cookieToSet,
      guestIpId: ipGuestId,
      isPhoto,
    };
  }

  const usage = await claimGuestSolverUsage(
    identity.guestId,
    secret,
    ipGuestId,
    isPhoto
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
    isPhoto,
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

  await releaseGuestSolverUsage(
    gate.guestId,
    secret,
    gate.guestIpId,
    gate.isPhoto
  );
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
