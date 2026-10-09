"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/forms";

/**
 * Run a form action and toast its result straight away. Unlike useActionToast, the
 * message still shows when the form disappears because of what it did (accepting a
 * referral removes it from the list; handing back ends the analyst's access).
 */
export function useToastAction(
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>,
  onSuccess?: () => void,
): [ActionState, (formData: FormData) => void, boolean] {
  const toast = useToast();
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  function run(formData: FormData) {
    start(async () => {
      const r = await action(null, formData);
      setState(r);
      if (r?.ok) {
        if (r.message) toast(r.message, "success");
        onSuccess?.();
      } else if (r?.message && !r.fieldErrors) {
        toast(r.message, "error");
      }
    });
  }

  return [state, run, pending];
}
