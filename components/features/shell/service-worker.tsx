"use client";

import { useEffect } from "react";

/** Registers the offline page's service worker. Production only, so development never serves stale files. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a nicety; the app works without it.
    });
  }, []);
  return null;
}
