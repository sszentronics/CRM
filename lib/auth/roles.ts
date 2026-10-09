export const ROLES = ["superadmin", "admin", "team_lead", "agent", "analyst"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  team_lead: "Team Lead",
  agent: "Agent",
  analyst: "Technical Analyst",
};

/** Where each role lands after signing in (BUILD.md Module 1). */
export const ROLE_HOME: Record<Role, string> = {
  superadmin: "/dashboard",
  admin: "/work-queue",
  team_lead: "/team",
  agent: "/today",
  analyst: "/sessions",
};

/** Roles that need the TOTP second step and are signed out when idle. */
export const MFA_ROLES: readonly Role[] = ["superadmin", "admin"];

export function needsMfa(role: Role) {
  return MFA_ROLES.includes(role);
}

/** Roles the Admin may add and manage (owner decision, 8 Oct 2026). The Superadmin manages every role. */
export const ADMIN_MANAGED_ROLES: readonly Role[] = ["team_lead", "agent"];

/** Roles `actor` may create, edit, move or disable. */
export function manageableRoles(actor: Role): readonly Role[] {
  if (actor === "superadmin") return ROLES;
  if (actor === "admin") return ADMIN_MANAGED_ROLES;
  return [];
}

export function canManageRole(actor: Role, target: Role): boolean {
  return manageableRoles(actor).includes(target);
}
