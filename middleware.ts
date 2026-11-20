import { NextResponse, type NextRequest } from "next/server";
import {
  isOwnerConsoleAssetPath,
  isOwnerConsoleHost,
  normalizeHost,
  ownerConsoleUrl,
  shouldRedirectApexOwnerPath,
} from "@/lib/owner-host";

export function middleware(request: NextRequest) {
  const host = normalizeHost(request.headers.get("host") || request.nextUrl.hostname);
  const { pathname, search } = request.nextUrl;

  if (shouldRedirectApexOwnerPath(host, pathname)) {
    return NextResponse.redirect(ownerConsoleUrl(pathname, search), 308);
  }

  if (isOwnerConsoleHost(host) && !isOwnerConsoleAssetPath(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/owner/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
