export const FREE_DAILY_SOLVER_LIMIT = 5;

/** At most this many of the daily Free/guest solves may be photo (upload/scan). */
export const FREE_DAILY_PHOTO_SOLVE_LIMIT = 1;

export const FREE_PLAN_NAME = "Free";

export const FREE_PLAN_SUMMARY = "Free: 5 solves/day incl. 1 photo";

export const DAILY_LIMIT_MESSAGE =
  "You've reached today's 5-question Free Plan limit.\nUpgrade for unlimited solving, or come back tomorrow.";

export const PHOTO_LIMIT_MESSAGE =
  "You've used your free photo solve today — type the question or upgrade to Pro (coming soon)";

/** UTC calendar day key, e.g. 2026-08-31 */
export function utcUsageDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Maximum photo upload size accepted by /api/solve-image (10 MB). */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

export const IMAGE_TOO_LARGE_MESSAGE =
  "That photo is too large (max 10 MB). Please take a closer photo of just the question, or choose a smaller image.";
