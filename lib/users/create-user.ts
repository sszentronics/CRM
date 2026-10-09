import type { Role } from "@/lib/auth/roles";
import { UserFacingError } from "@/lib/errors";
import type { CreateUserInput } from "./schemas";

export type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  team_id: string | null;
};

export type CreateUserDeps = {
  /** Creates the auth account and emails a set-password link. Returns the new user's id. */
  inviteUser(email: string, fullName: string): Promise<{ id: string }>;
  /** Inserts the profile as the acting Superadmin, so row-level security checks it too. */
  insertProfile(row: ProfileRow): Promise<void>;
  /** Undo for a half-created account when the profile insert fails. */
  removeAuthUser(id: string): Promise<void>;
  audit(entry: {
    actorId: string;
    action: string;
    entity: string;
    entityId: string;
    meta: Record<string, unknown>;
  }): Promise<void>;
};

/** Raised with a message the Superadmin can act on. */
export class UserInputError extends UserFacingError {}

/**
 * Create one staff account. The caller has already checked the actor is the
 * Superadmin. Writes exactly one audit row naming the actor and the new user.
 */
export async function createUserCore(
  deps: CreateUserDeps,
  actor: { id: string },
  input: CreateUserInput,
): Promise<{ id: string }> {
  const { id } = await deps.inviteUser(input.email, input.fullName);
  const row: ProfileRow = {
    id,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    role: input.role,
    team_id: input.teamId,
  };
  try {
    await deps.insertProfile(row);
  } catch (err) {
    await deps.removeAuthUser(id);
    throw err;
  }
  await deps.audit({
    actorId: actor.id,
    action: "user.create",
    entity: "profile",
    entityId: id,
    meta: { email: row.email, role: row.role, team_id: row.team_id },
  });
  return { id };
}
