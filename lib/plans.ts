import { FREE_DAILY_SOLVER_LIMIT, FREE_PLAN_NAME } from "./constants";

/** Supported EasyMath AI plans. */
export type UserPlan = "free" | "pro";

export const USER_PLANS: UserPlan[] = ["free", "pro"];

export const PRO_PLAN_NAME = "Pro";

/**
 * Daily solver question limit for a plan.
 * `null` means unlimited.
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

/** Normalize a stored plan value; unknown/missing values become Free. */
export function resolveUserPlan(planFromProfile?: string | null): UserPlan {
  if (typeof planFromProfile === "string" && planFromProfile.trim().toLowerCase() === "pro") {
    return "pro";
  }

  return "free";
}

export function getPlanDisplayName(plan: UserPlan): string {
  return plan === "pro" ? PRO_PLAN_NAME : FREE_PLAN_NAME;
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
