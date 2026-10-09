"use client";

import { ChevronDown } from "lucide-react";
import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Field, controlClass, describedBy } from "./field";

export type SelectOption = { value: string; label: string };

export type SelectProps = Omit<ComponentProps<"select">, "children"> & {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  hint?: string;
};

/** Native select: the phone's own picker is the fastest thing on a phone. */
export function Select({ label, options, placeholder, error, hint, id, className, ...props }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <Field id={selectId} label={label} error={error} hint={hint} className={className}>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(selectId, error, hint)}
          className={cn(controlClass, "appearance-none pr-10")}
          {...props}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-tl-muted"
        />
      </div>
    </Field>
  );
}
