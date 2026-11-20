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

/** True when a Pro expiry timestamp is present and has already passed. */
export function isProExpiryPassed(expiresAt?: string | Date | null): boolean {
  if (expiresAt == null || expiresAt === "") {
    return false;
  }

  const expires = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);

  if (Number.isNaN(expires.getTime())) {
    return false;
  }

  return expires.getTime() <= Date.now();
}

/**
 * Normalize a stored plan value; unknown/missing values become Free.
 * Expired Pro is treated as Free at read time.
 */
export function resolveUserPlan(
  planFromProfile?: string | null,
  expiresAt?: string | Date | null
): UserPlan {
  if (typeof planFromProfile === "string" && planFromProfile.trim().toLowerCase() === "pro") {
    if (isProExpiryPassed(expiresAt)) {
      return "free";
    }

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

/**
 * Parse an optional expiry from the owner tools.
 * A YYYY-MM-DD value is inclusive through the end of that UTC day.
 * Returns null when no expiry was given, or "invalid" when it cannot be parsed.
 */
export function parseExpiryDateInput(value: unknown): Date | null | "invalid" {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return "invalid";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (day) {
    const year = Number(day[1]);
    const month = Number(day[2]);
    const date = Number(day[3]);
    const parsed = new Date(Date.UTC(year, month - 1, date, 23, 59, 59, 999));

    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== date
    ) {
      return "invalid";
    }

    return parsed;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return "invalid";
  }

  return parsed;
}
