import "server-only";
import { getSessionContext, type Profile } from "./session";
import { needsMfa, type Role } from "./roles";

export class PermissionError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "PermissionError";
  }
}

/**
 * Every server action starts here. Re-reads the session on the server and
 * refuses unless the caller is active, past TOTP when needed, and in `roles`.
 */
export async function requireActor(roles: readonly Role[]): Promise<Profile> {
  const ctx = await getSessionContext();
  const profile = ctx?.profile;
  if (!ctx || !profile || !profile.is_active) throw new PermissionError("Sign in to do that.");
  if (needsMfa(profile.role, profile.plan) && ctx.aal !== "aal2") throw new PermissionError("Enter your 6-digit code first.");
  if (!roles.includes(profile.role)) throw new PermissionError();
  return profile;
}
