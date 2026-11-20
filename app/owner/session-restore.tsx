"use client";

import { useEffect } from "react";
import { getAccessToken } from "@/lib/client-auth";

const RETRY_FLAG = "ema_session_retry";

/** If a browser session exists, set the httpOnly cookie and retry once. */
export default function SessionRestore() {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (sessionStorage.getItem(RETRY_FLAG) === "1") {
        sessionStorage.removeItem(RETRY_FLAG);
        return;
      }

      const token = await getAccessToken();

      if (!token || cancelled) {
        return;
      }

      const response = await fetch("/api/auth/session-cookie", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok || cancelled) {
        return;
      }

      sessionStorage.setItem(RETRY_FLAG, "1");
      window.location.replace("/owner");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
