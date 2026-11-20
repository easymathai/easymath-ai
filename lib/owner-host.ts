export const OWNER_CONSOLE_HOST = "owner.easymathai.com";

export const PUBLIC_APEX_HOSTS = new Set(["easymathai.com", "www.easymathai.com"]);

export function normalizeHost(hostHeader?: string | null): string {
  return (hostHeader || "").split(":")[0]?.trim().toLowerCase() || "";
}

export function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
}

export function isPreviewHost(host: string): boolean {
  return host.endsWith(".vercel.app");
}

export function isOwnerConsoleHost(host: string): boolean {
  return host === OWNER_CONSOLE_HOST;
}

export function shouldRedirectApexOwnerPath(host: string, pathname: string): boolean {
  if (isLocalHost(host) || isPreviewHost(host)) {
    return false;
  }

  return PUBLIC_APEX_HOSTS.has(host) && pathname.startsWith("/owner");
}

export function ownerConsoleUrl(pathname: string, search = ""): string {
  return `https://${OWNER_CONSOLE_HOST}${pathname}${search}`;
}

export function isOwnerConsoleAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/owner") ||
    pathname.startsWith("/api/owner") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/branding") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png"
  );
}
