export const FREE_DAILY_SOLVER_LIMIT = 10;

export const FREE_PLAN_NAME = "Free";

export const DAILY_LIMIT_MESSAGE =
  "You've reached today's 10-question Free Plan limit.\nUpgrade for unlimited solving, or come back tomorrow.";

/** UTC calendar day key, e.g. 2026-08-31 */
export function utcUsageDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Maximum photo upload size accepted by /api/solve-image (10 MB). */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

export const IMAGE_TOO_LARGE_MESSAGE =
  "That photo is too large (max 10 MB). Please take a closer photo of just the question, or choose a smaller image.";
