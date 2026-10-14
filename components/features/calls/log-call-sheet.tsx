"use client";

import { Ban, CalendarClock, PhoneMissed, Sparkles, ThumbsDown } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { logCall } from "@/app/(app)/lead/[id]/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { followUpQuickPicks } from "@/lib/format/dates";
import { formatPhone } from "@/lib/format/phone";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import type { Temperature } from "@/lib/leads/contact";
import { OUTCOME_LABEL, outcomesFor, type CallOutcome } from "@/lib/leads/stage-machine";
import type { Stage } from "@/lib/leads/stages";
import { cn } from "@/lib/utils";
import { FollowUpPicker } from "./follow-up-picker";
import { InterestField } from "./interest-field";

export type CallTarget = { id: string; full_name: string; phone: string; stage: Stage; temperature?: Temperature | null };
export type CallReasons = { notInterested: string[]; invalid: string[] };

const ICON: Record<CallOutcome, typeof PhoneMissed> = {
  no_answer: PhoneMissed,
  follow_up: CalendarClock,
  interested: Sparkles,
  not_interested: ThumbsDown,
  invalid: Ban,
};

/** Default follow-up per outcome, so a No answer takes two taps: the outcome, then Save. */
function defaultFollowUp(outcome: CallOutcome): Date | null {
  const picks = followUpQuickPicks();
  if (outcome === "no_answer") return picks.find((p) => p.key === "2h")!.at;
  if (outcome === "follow_up" || outcome === "interested") return picks.find((p) => p.key === "tomorrow")!.at;
  return null;
}

/** Log a call: five outcomes, notes, the next follow-up, and a reason when the lead closes. */
export function LogCallSheet({
  lead,
  reasons,
  open,
  onClose,
}: {
  lead: CallTarget | null;
  reasons: CallReasons;
  open: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  const [state, action, pending] = useActionState(logCall, null);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [followUp, setFollowUp] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [interest, setInterest] = useState<Temperature | "">(lead?.temperature ?? "");
  // Success toasts and closes; errors without a field toast too; field errors stay on the fields.
  useActionToast(state, onClose);

  if (!lead) return null;
  const allowed = outcomesFor(lead.stage);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const needsFollowUp = outcome === "no_answer" || outcome === "follow_up" || outcome === "interested";
  const needsReason = outcome === "not_interested" || outcome === "invalid";
  const needsNote = outcome === "interested" || outcome === "not_interested";
  const reasonList = outcome === "invalid" ? reasons.invalid : reasons.notInterested;

  function choose(o: CallOutcome) {
    setOutcome(o);
    setReason("");
    if (!followUp || o === "not_interested" || o === "invalid") setFollowUp(defaultFollowUp(o));
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dirty={!!outcome || notes.length > 0}
      title={`Log a call: ${lead.full_name}`}
      description={formatPhone(lead.phone)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending || !outcome}>
            {pending ? "Saving" : "Save call"}
          </Button>
        </>
      }
    >
      <form id={formId} action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="leadId" value={lead.id} />
        <input type="hidden" name="stage" value={lead.stage} />
        <input type="hidden" name="outcome" value={outcome ?? ""} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label font-medium text-tl-text">What happened?</legend>
          <div className="grid grid-cols-2 gap-2">
            {allowed.map((o) => {
              const Icon = ICON[o];
              const on = outcome === o;
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(o)}
                  className={cn(
                    "flex h-12 items-center gap-2.5 rounded-control border px-3 text-left text-body font-semibold transition-colors",
                    on ? "border-tl-primary bg-tl-primary text-white" : "border-tl-line-strong bg-tl-surface text-tl-text hover:bg-tl-raised",
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {OUTCOME_LABEL[o]}
                </button>
              );
            })}
          </div>
          {errors.outcome ? <p className="text-small font-medium text-tl-danger">{errors.outcome[0]}</p> : null}
        </fieldset>

        {needsReason ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${formId}-reason`} className="text-label font-medium text-tl-text">
              Reason
            </label>
            <select
              id={`${formId}-reason`}
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={errors.reason ? true : undefined}
              className="h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text aria-invalid:border-tl-danger"
            >
              <option value="">Choose a reason</option>
              {reasonList.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {errors.reason ? <p className="text-small font-medium text-tl-danger">{errors.reason[0]}</p> : null}
            {outcome === "invalid" ? (
              <p className="text-small text-tl-muted">Your Team Lead confirms an Invalid mark before the lead closes for good.</p>
            ) : null}
          </div>
        ) : null}

        {needsFollowUp ? <FollowUpPicker value={followUp} onChange={setFollowUp} error={errors.followUpAt?.[0]} /> : null}

        <InterestField value={interest} onChange={setInterest} />

        <div className="flex flex-col gap-1">
          <label htmlFor={`${formId}-notes`} className="text-label font-medium text-tl-text">
            Notes{needsNote ? "" : " (optional)"}
          </label>
          <textarea
            id={`${formId}-notes`}
            name="notes"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-invalid={errors.notes ? true : undefined}
            placeholder={needsNote ? "What did they say?" : "Anything worth remembering"}
            className="rounded-control border border-tl-line-strong bg-tl-surface px-3 py-2 text-body text-tl-text placeholder:text-tl-muted aria-invalid:border-tl-danger"
          />
          {errors.notes ? <p className="text-small font-medium text-tl-danger">{errors.notes[0]}</p> : null}
        </div>
      </form>
    </Sheet>
  );
}
