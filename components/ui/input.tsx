"use client";

import { useId, type ComponentProps } from "react";
import { Field, controlClass, describedBy } from "./field";

export type InputProps = ComponentProps<"input"> & {
  label: string;
  /** A full sentence that says what is wrong and how to fix it. */
  error?: string;
  hint?: string;
};

export function Input({ label, error, hint, id, className, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} error={error} hint={hint} className={className}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={controlClass}
        {...props}
      />
    </Field>
  );
}
