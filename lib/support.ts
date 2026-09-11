export const DEFAULT_SUPPORT_EMAIL = "easymathai2026@gmail.com";

/** Public support address. NEXT_PUBLIC_SUPPORT_EMAIL overrides the default if set. */
export function getSupportEmail(): string {
  const override = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";
  return override || DEFAULT_SUPPORT_EMAIL;
}
