"use client";

import { useEffect, useRef, type FormEvent, type RefObject } from "react";
import type { ActionState } from "@/lib/forms";

/**
 * React 19 clears an uncontrolled form once its action finishes, even when the action
 * failed, so a mistyped phone number would also wipe the name, email and team the person
 * had filled in. This keeps what they typed when the action returns an error.
 *
 * Give the form a `ref` and pass the returned function as its `onSubmitCapture`. On success
 * nothing is restored, so the reset still gives an empty form for "save and add another".
 */
export function useKeepFormOnError(ref: RefObject<HTMLFormElement | null>, state: ActionState) {
  const snapshot = useRef<FormData | null>(null);

  useEffect(() => {
    const form = ref.current;
    const saved = snapshot.current;
    if (!form || !saved || !state || state.ok) return;
    restore(form, saved);
  }, [ref, state]);

  return (e: FormEvent<HTMLFormElement>) => {
    snapshot.current = new FormData(e.currentTarget);
  };
}

function restore(form: HTMLFormElement, saved: FormData) {
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (!el.name || (el instanceof HTMLInputElement && (el.type === "file" || el.type === "hidden" || el.type === "password"))) continue;
    const values = saved.getAll(el.name).filter((v): v is string => typeof v === "string");
    if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
      el.checked = values.includes(el.value);
    } else if (values.length > 0) {
      el.value = values[0];
    } else if (el instanceof HTMLSelectElement) {
      el.value = "";
    }
  }
}
