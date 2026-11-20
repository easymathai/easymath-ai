"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Keeps a short-lived httpOnly session cookie in sync with the browser login. */
export default function SessionCookieSync() {
  useEffect(() => {
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
  }, []);

  return null;
}
