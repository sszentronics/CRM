import "server-only";
import { PermissionError, requireActor } from "@/lib/auth/actor";
import type { Role } from "@/lib/auth/roles";
import type { Profile } from "@/lib/auth/session";
import { UserFacingError } from "@/lib/errors";
import type { ActionState } from "@/lib/forms";

export { UserFacingError };

/**
 * Every server action runs through this: it re-checks the caller on the server,
 * then turns refusals and user-facing errors into a message instead of a crash.
 */
export async function guardedAction(
  roles: readonly Role[],
  run: (actorId: string, actor: Profile) => Promise<ActionState>,
): Promise<ActionState> {
  try {
    const actor = await requireActor(roles);
    return await run(actor.id, actor);
  } catch (err) {
    if (err instanceof PermissionError || err instanceof UserFacingError) return { ok: false, message: err.message };
    throw err;
  }
}
