import { FREE_DAILY_SOLVER_LIMIT } from "./constants";

/** Future paid plans can extend this without rewriting solver routes. */
export type UserPlan = "free" | "pro";

/**
 * Daily solver question limit for a plan.
 * `null` means unlimited (future paid plans).
 */
export function getDailySolverLimitForPlan(plan: UserPlan): number | null {
  switch (plan) {
    case "pro":
      return null;
    case "free":
    default:
      return FREE_DAILY_SOLVER_LIMIT;
  }
}

/** Until paid billing exists, every account is treated as Free. */
export function resolveUserPlan(_planFromProfile?: string | null): UserPlan {
  return "free";
}

export function isSolverLimitReached(
  used: number,
  limit: number | null
): boolean {
  if (limit === null) {
    return false;
  }

  return used >= limit;
}
