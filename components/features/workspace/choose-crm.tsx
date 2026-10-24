"use client";

import { useActionState } from "react";
import { chooseDefaultCrm } from "@/app/(app)/workspace/actions";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/lib/hooks/use-action-toast";

/** Starts the default CRM for a demo workspace. */
export function ChooseCrm() {
  const [state, action, pending] = useActionState(chooseDefaultCrm, null);
  useActionToast(state);
  return (
    <form action={action}>
      <Button type="submit" disabled={pending}>
        {pending ? "Starting" : "Use the default CRM"}
      </Button>
    </form>
  );
}
