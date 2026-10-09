"use client";

import { useId, useMemo, useState } from "react";
import { dateToKarachiInput, describeWhen, followUpQuickPicks, karachiInputToDate } from "@/lib/format/dates";
import { cn } from "@/lib/utils";

/**
 * Quick picks plus a date and time picker, all in Karachi time. Writes the chosen
 * instant as ISO into a hidden `name` field.
 */
export function FollowUpPicker({
  name = "followUpAt",
  value,
  onChange,
  error,
  label = "Next follow-up",
}: {
  name?: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  error?: string;
  label?: string;
}) {
  const id = useId();
  const picks = useMemo(() => followUpQuickPicks(), []);
  const [custom, setCustom] = useState(false);
  const activeKey = picks.find((p) => value && p.at.getTime() === value.getTime())?.key;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-label font-medium text-tl-text">{label}</legend>
      <input type="hidden" name={name} value={value?.toISOString() ?? ""} />
      <div className="flex flex-wrap gap-2">
        {picks.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={activeKey === p.key}
            onClick={() => {
              setCustom(false);
              onChange(p.at);
            }}
            className={cn(
              "h-9 rounded-full border px-3 text-label font-semibold transition-colors",
              activeKey === p.key
                ? "border-tl-primary bg-tl-primary text-white"
                : "border-tl-line-strong bg-tl-surface text-tl-text hover:bg-tl-raised",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom || (!!value && !activeKey)}
          onClick={() => setCustom(true)}
          className={cn(
            "h-9 rounded-full border px-3 text-label font-semibold",
            custom || (value && !activeKey) ? "border-tl-primary bg-tl-primary-soft text-tl-primary" : "border-tl-line-strong bg-tl-surface text-tl-text hover:bg-tl-raised",
          )}
        >
          Pick a time
        </button>
      </div>
      {custom || (value && !activeKey) ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="text-small font-medium text-tl-muted">
            Date and time (Karachi)
          </label>
          <input
            id={id}
            type="datetime-local"
            value={value ? dateToKarachiInput(value) : ""}
            min={dateToKarachiInput(new Date())}
            onChange={(e) => onChange(karachiInputToDate(e.target.value))}
            className="h-10 w-64 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text"
          />
        </div>
      ) : null}
      {value ? <p className="text-small text-tl-muted">Due {describeWhen(value)}.</p> : null}
      {error ? <p className="text-small font-medium text-tl-danger">{error}</p> : null}
    </fieldset>
  );
}
