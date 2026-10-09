"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/forms";

/**
 * Toast the outcome of a form action once per result. On success, `onSuccess`
 * runs too (usually to close the drawer). Field errors stay on the fields.
 */
export function useActionToast(state: ActionState, onSuccess?: () => void) {
  const toast = useToast();
  const seen = useRef<ActionState>(null);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.ok) {
      if (state.message) toast(state.message, "success");
      onSuccessRef.current?.();
    } else if (state.message && !state.fieldErrors) {
      toast(state.message, "error");
    }
  }, [state, toast]);
}
