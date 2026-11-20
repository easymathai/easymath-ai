"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function isOwnerConsoleSurface(pathname: string | null): boolean {
  if (pathname?.startsWith("/owner")) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  return window.location.hostname.toLowerCase() === "owner.easymathai.com";
}

/** Keeps a short-lived httpOnly session cookie in sync with the public-site login. */
export default function SessionCookieSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (isOwnerConsoleSurface(pathname)) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.access_token) {
        void fetch("/api/auth/session-cookie", { method: "DELETE" });
        return;
      }

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED"
      ) {
        void fetch("/api/auth/session-cookie", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname]);

  return null;
}
