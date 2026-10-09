"use client";

import { useEffect } from "react";

const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;

/** Signs Admin and Superadmin out after `minutes` without activity. */
export function IdleSignOut({ minutes }: { minutes: number }) {
  useEffect(() => {
    const limit = minutes * 60_000;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    for (const e of EVENTS) window.addEventListener(e, touch, { passive: true });
    const timer = window.setInterval(() => {
      // A full page load, not a client navigation: the route handler must clear the session cookies.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (Date.now() - last >= limit) window.location.assign("/auth/signout?reason=idle");
    }, 15_000);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, touch);
      window.clearInterval(timer);
    };
  }, [minutes]);
  return null;
}
