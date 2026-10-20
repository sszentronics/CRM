import { FormMessage } from "@/components/features/auth/form-message";
import type { ActionState } from "@/lib/forms";

/**
 * The reason a form action failed, shown inside the drawer next to the form so it stays
 * on screen until the person fixes it. Field errors are shown under their fields instead.
 */
export function ActionError({ state }: { state: ActionState }) {
  if (!state || state.ok || !state.message) return null;
  return <FormMessage tone="error">{state.message}</FormMessage>;
}
