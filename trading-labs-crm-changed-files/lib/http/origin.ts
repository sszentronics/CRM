import { NextResponse, type NextRequest } from "next/server";

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

/**
 * Redirect to a path on this site with a *relative* Location header ("/login?reason=x").
 *
 * Behind a host's reverse proxy (Hostinger, Docker, Nginx) the Host header can itself be
 * the internal address ("0.0.0.0:3000") with no x-forwarded-host, so even publicOrigin()
 * cannot recover the public domain. A relative Location is resolved by the browser against
 * the address it is actually on, so it works on any domain with no configuration.
 * Use this in route handlers. Middleware (proxy.ts) needs an absolute URL instead.
 */
export function redirectTo(path: string, status = 307): NextResponse {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return new NextResponse(null, { status, headers: { Location: safe } });
}
