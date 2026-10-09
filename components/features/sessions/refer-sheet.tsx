"use client";

import { useActionState, useId, useState } from "react";
import { referLead } from "@/app/(app)/sessions/actions";
import { FollowUpPicker } from "@/components/features/calls/follow-up-picker";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { MODES } from "@/lib/sessions/rules";
import { cn } from "@/lib/utils";

export type AnalystLoad = { analyst_id: string; full_name: string; open_sessions: number };

const radioCard =
  "flex cursor-pointer items-center justify-between gap-3 rounded-control border border-tl-line-strong px-3 py-2.5 has-[:checked]:border-tl-primary has-[:checked]:bg-tl-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-tl-focus";

/** Refer an interested client to Technical Analysis. */
export function ReferSheet({
  lead,
  analysts,
  open,
  onClose,
}: {
  lead: { id: string; full_name: string };
  analysts: AnalystLoad[];
  open: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  const [state, action, pending] = useActionState(referLead, null);
  const [preferred, setPreferred] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  useActionToast(state, onClose);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dirty={note.length > 0}
      title="Refer to Technical Analysis"
      description={`${lead.full_name} stays your client. The analyst gives the session and hands back.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? "Referring" : "Refer"}
          </Button>
        </>
      }
    >
      <form id={formId} action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="leadId" value={lead.id} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label font-medium text-tl-text">Analyst</legend>
          <label className={radioCard}>
            <span className="flex items-center gap-3">
              <input type="radio" name="analystId" value="" defaultChecked className="size-4 accent-[var(--tl-primary)]" />
              <span className="text-body font-semibold text-tl-text">Any available</span>
            </span>
            <span className="text-small text-tl-muted">First to accept</span>
          </label>
          {analysts.map((a) => (
            <label key={a.analyst_id} className={radioCard}>
              <span className="flex items-center gap-3">
                <input type="radio" name="analystId" value={a.analyst_id} className="size-4 accent-[var(--tl-primary)]" />
                <span className="text-body font-semibold text-tl-text">{a.full_name}</span>
              </span>
              <span className="text-small text-tl-muted">
                {a.open_sessions} open {a.open_sessions === 1 ? "session" : "sessions"}
              </span>
            </label>
          ))}
          {analysts.length === 0 ? <p className="text-small text-tl-muted">No analysts yet. The Superadmin adds them.</p> : null}
        </fieldset>

        <FollowUpPicker name="preferredAt" label="Client's preferred time (optional)" value={preferred} onChange={setPreferred} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label font-medium text-tl-text">How</legend>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m, i) => (
              <label key={m.value} className={cn(radioCard, "justify-center")}>
                <input type="radio" name="mode" value={m.value} defaultChecked={i === 0} className="sr-only" />
                <span className="text-label font-semibold text-tl-text">{m.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${formId}-note`} className="text-label font-medium text-tl-text">
            Note for the analyst
          </label>
          <textarea
            id={`${formId}-note`}
            name="note"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={state?.fieldErrors?.note ? true : undefined}
            placeholder="What does the client want to understand? Experience, budget, worries."
            className="rounded-control border border-tl-line-strong bg-tl-surface px-3 py-2 text-body text-tl-text placeholder:text-tl-muted aria-invalid:border-tl-danger"
          />
          {state?.fieldErrors?.note ? <p className="text-small font-medium text-tl-danger">{state.fieldErrors.note[0]}</p> : null}
        </div>
      </form>
    </Sheet>
  );
}
