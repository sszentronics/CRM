import type { NextRequest } from "next/server";

/**
 * The address the visitor really used, for redirects from route handlers.
 *
 * `request.nextUrl.origin` can be the address the server *listens* on ("0.0.0.0" or
 * "localhost") when the app runs on a LAN machine or behind a proxy, which sends a
 * signed-out visitor to a page their browser cannot reach. The Host header is what
 * their browser typed, so it wins. Forwarded headers come first when a proxy sets them.
 */
export function publicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!host || !/^[a-z0-9.\-:[\]]+$/i.test(host)) return request.nextUrl.origin;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
