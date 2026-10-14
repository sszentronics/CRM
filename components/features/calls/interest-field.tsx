"use client";

import { TEMPERATURES, TEMPERATURE_LABEL, type Temperature } from "@/lib/leads/contact";
import { cn } from "@/lib/utils";

/** Hot, Warm or Cold buttons. Submits `temperature` with the form; empty means "leave as it is". */
export function InterestField({
  value,
  onChange,
  name = "temperature",
}: {
  value: Temperature | "";
  onChange: (v: Temperature | "") => void;
  name?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-label font-medium text-tl-text">How keen are they to invest? (optional)</legend>
      <input type="hidden" name={name} value={value} />
      <div className="grid grid-cols-3 gap-2">
        {TEMPERATURES.map((t) => {
          const on = value === t;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? "" : t)}
              className={cn(
                "h-10 rounded-control border text-body font-semibold transition-colors",
                on ? "border-tl-primary bg-tl-primary text-white" : "border-tl-line-strong bg-tl-surface text-tl-text hover:bg-tl-raised",
              )}
            >
              {TEMPERATURE_LABEL[t]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
