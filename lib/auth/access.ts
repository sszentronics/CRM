import { ROLES, type Role } from "./roles";

const ALL = ROLES;
const ADMINS: Role[] = ["superadmin", "admin"];
const SUPER: Role[] = ["superadmin"];

/**
 * Which roles may open each screen (BUILD.md section 3). The UI hides what a
 * role cannot open, and every page checks this again on the server.
 */
export const ROUTE_ACCESS: Record<string, readonly Role[]> = {
  "/dashboard": SUPER,
  "/work-queue": ADMINS,
  "/team": ["team_lead"],
  "/today": ["agent", "team_lead"],
  "/pipeline": ["agent", "team_lead"],
  "/sessions": ["analyst", ...ADMINS],
  "/arena": ALL,
  "/leaderboard": ALL,
  "/leads": ADMINS,
  // One lead. Open to every role; row-level security decides which leads each person may see.
  "/lead": ALL,
  "/distribution": ADMINS,
  "/documents": ADMINS,
  "/deposits": ADMINS,
  "/reports": ADMINS,
  "/exports": ADMINS,
  "/users": ADMINS,
  "/brokers": SUPER,
  "/targets": SUPER,
  "/prizes": ADMINS,
  "/settings": SUPER,
  "/audit-log": SUPER,
  "/styleguide": SUPER,
  "/notifications": ALL,
  "/profile": ALL,
  "/search": ALL,
};

/** True when `role` may open `path`. Unknown paths are closed. */
export function canAccess(role: Role, path: string): boolean {
  const base = Object.keys(ROUTE_ACCESS)
    .filter((p) => path === p || path.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  return base ? ROUTE_ACCESS[base].includes(role) : false;
}

/** Only follow `next` when it is a same-site path the role may open. */
export function safeNext(role: Role, next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  const path = next.split("?")[0];
  return canAccess(role, path) ? next : null;
}
