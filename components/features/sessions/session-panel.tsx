"use client";

import { CalendarCheck, CircleCheck, CircleX, Clock } from "lucide-react";
import { useActionState, useState } from "react";
import { acceptReferral, cancelReferral, recordOutcome, scheduleSession } from "@/app/(app)/sessions/actions";
import { FollowUpPicker } from "@/components/features/calls/follow-up-picker";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { describeWhen, formatKarachi } from "@/lib/format/dates";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { useToastAction } from "@/lib/hooks/use-toast-action";
import type { Stage } from "@/lib/leads/stages";
import { CLIENT_LEVELS, INTEREST_LEVELS, MODES, OUTCOME_LABEL, type Mode, type SessionOutcome } from "@/lib/sessions/rules";
import { cn } from "@/lib/utils";

export type SessionRow = {
  id: string;
  created_at: string;
  analyst_id: string | null;
  referred_by: string;
  referral_note: string;
  preferred_at: string | null;
  scheduled_at: string | null;
  mode: Mode;
  accepted_at: string | null;
  outcome: SessionOutcome | null;
  client_level: string | null;
  interest_level: string | null;
  notes: string | null;
  next_step: string | null;
  handed_back_at: string | null;
  cancelled_at: string | null;
};

const label = <T extends { value: string; label: string }>(list: readonly T[], v: string | null) =>
  list.find((x) => x.value === v)?.label ?? v ?? "Not given";

const field = "h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text";

function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-small text-tl-muted">{name}</dt>
      <dd className="text-body text-tl-text">{children}</dd>
    </div>
  );
}

function AcceptButton({ sessionId }: { sessionId: string }) {
  const [, action, pending] = useToastAction(acceptReferral);
  return (
    <form action={action}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" disabled={pending}>
        Accept referral
      </Button>
    </form>
  );
}

function ScheduleForm({ session }: { session: SessionRow }) {
  const [state, action, pending] = useActionState(scheduleSession, null);
  const [when, setWhen] = useState<Date | null>(session.scheduled_at ? new Date(session.scheduled_at) : null);
  useActionToast(state);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="sessionId" value={session.id} />
      <FollowUpPicker name="scheduledAt" label={session.scheduled_at ? "Move the session" : "Book the session"} value={when} onChange={setWhen} error={state?.fieldErrors?.scheduledAt?.[0]} />
      <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
        How
        <select name="mode" defaultValue={session.mode} className={cn(field, "w-56")}>
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {session.scheduled_at ? "Move session" : "Book session"}
        </Button>
      </div>
    </form>
  );
}

function OutcomeForm({ session, stage }: { session: SessionRow; stage: Stage }) {
  const [state, action, pending] = useToastAction(recordOutcome);
  const [outcome, setOutcome] = useState<"attended" | "no_show" | null>(null);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4 border-t border-tl-line pt-4" noValidate>
      <input type="hidden" name="sessionId" value={session.id} />
      <input type="hidden" name="stage" value={stage} />
      <input type="hidden" name="outcome" value={outcome ?? ""} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label font-medium text-tl-text">How did it go?</legend>
        <div className="flex gap-2">
          {(["attended", "no_show"] as const).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={outcome === o}
              onClick={() => setOutcome(o)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-control border px-4 text-body font-semibold",
                outcome === o ? "border-tl-primary bg-tl-primary text-white" : "border-tl-line-strong bg-tl-surface text-tl-text hover:bg-tl-raised",
              )}
            >
              {o === "attended" ? <CircleCheck aria-hidden className="size-4" /> : <CircleX aria-hidden className="size-4" />}
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
        {errors.outcome ? <p className="text-small font-medium text-tl-danger">{errors.outcome[0]}</p> : null}
      </fieldset>
      {outcome === "attended" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
            Client level
            <select name="clientLevel" defaultValue="" aria-invalid={errors.clientLevel ? true : undefined} className={cn(field, "aria-invalid:border-tl-danger")}>
              <option value="">Choose</option>
              {CLIENT_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            {errors.clientLevel ? <span className="text-small font-medium text-tl-danger">{errors.clientLevel[0]}</span> : null}
          </label>
          <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
            Interest
            <select name="interestLevel" defaultValue="" aria-invalid={errors.interestLevel ? true : undefined} className={cn(field, "aria-invalid:border-tl-danger")}>
              <option value="">Choose</option>
              {INTEREST_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            {errors.interestLevel ? <span className="text-small font-medium text-tl-danger">{errors.interestLevel[0]}</span> : null}
          </label>
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
        Notes for the agent{outcome === "attended" ? "" : " (optional)"}
        <textarea
          name="notes"
          rows={4}
          maxLength={3000}
          aria-invalid={errors.notes ? true : undefined}
          placeholder="What you covered, what they understood, what still worries them."
          className="rounded-control border border-tl-line-strong bg-tl-surface px-3 py-2 text-body font-normal text-tl-text placeholder:text-tl-muted aria-invalid:border-tl-danger"
        />
        {errors.notes ? <span className="text-small font-medium text-tl-danger">{errors.notes[0]}</span> : null}
      </label>
      <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
        Next step (optional)
        <input name="nextStep" maxLength={300} placeholder="For example: ready to open a PSX account" className={field} />
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !outcome}>
          {pending ? "Saving" : "Save and hand back"}
        </Button>
      </div>
    </form>
  );
}

function CancelForm({ sessionId }: { sessionId: string }) {
  const [, action, pending] = useToastAction(cancelReferral);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Cancel referral
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
        Why
        <input name="reason" maxLength={200} placeholder="For example: client changed their mind" className={cn(field, "w-72")} />
      </label>
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        Cancel the referral
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Keep it
      </Button>
    </form>
  );
}

function status(s: SessionRow): { text: string; Icon: typeof Clock } {
  if (s.cancelled_at) return { text: "Cancelled", Icon: CircleX };
  if (s.handed_back_at) return { text: s.outcome === "attended" ? "Attended" : "No-show", Icon: s.outcome === "attended" ? CircleCheck : CircleX };
  if (s.scheduled_at) return { text: `Booked for ${describeWhen(new Date(s.scheduled_at))}`, Icon: CalendarCheck };
  if (s.accepted_at) return { text: "Accepted, no time booked yet", Icon: Clock };
  return { text: s.analyst_id ? "Waiting for the analyst to accept" : "Waiting for any analyst to accept", Icon: Clock };
}

/** The Session tab on the lead page. */
export function SessionPanel({
  sessions,
  names,
  stage,
  viewerId,
  isAnalyst,
  canRefer,
  onRefer,
  ownsLead,
}: {
  sessions: SessionRow[];
  names: Record<string, string>;
  stage: Stage;
  viewerId: string;
  isAnalyst: boolean;
  canRefer: boolean;
  onRefer: () => void;
  ownsLead: boolean;
}) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No Technical Analysis session yet."
        body="Interested clients can talk to an analyst before they open an account. It is optional."
        action={canRefer ? <Button onClick={onRefer}>Refer to Technical Analysis</Button> : undefined}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {canRefer ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onRefer}>
            Refer again
          </Button>
        </div>
      ) : null}
      {sessions.map((s) => {
        const open = !s.handed_back_at && !s.cancelled_at;
        const mine = s.analyst_id === viewerId;
        const st = status(s);
        return (
          <Card key={s.id} className={cn("flex flex-col gap-4", open && "border-tl-primary/40")}>
            <CardHeader
              className="mb-0"
              title={s.analyst_id ? `Session with ${names[s.analyst_id] ?? "an analyst"}` : "Referral to any analyst"}
              description={`Referred ${formatKarachi(s.created_at, "date")} by ${names[s.referred_by] ?? "the agent"}`}
              actions={
                <span className="inline-flex items-center gap-1.5 rounded-full border border-tl-line bg-tl-bg px-2.5 py-1 text-small font-semibold text-tl-text-2">
                  <st.Icon aria-hidden className="size-3.5" />
                  {st.text}
                </span>
              }
            />
            <dl className="grid gap-4 md:grid-cols-3">
              <Fact name="Agent's note">{s.referral_note}</Fact>
              <Fact name="Preferred time">{s.preferred_at ? describeWhen(new Date(s.preferred_at)) : "Any time"}</Fact>
              <Fact name="How">{label(MODES, s.mode)}</Fact>
            </dl>
            {s.handed_back_at && s.outcome === "attended" ? (
              <dl className="grid gap-4 rounded-control bg-tl-bg p-4 md:grid-cols-3">
                <Fact name="Client level">{label(CLIENT_LEVELS, s.client_level)}</Fact>
                <Fact name="Interest">{label(INTEREST_LEVELS, s.interest_level)}</Fact>
                <Fact name="Next step">{s.next_step ?? "None given"}</Fact>
                <div className="md:col-span-3">
                  <Fact name="Analyst's notes">
                    <span className="whitespace-pre-wrap">{s.notes}</span>
                  </Fact>
                </div>
              </dl>
            ) : s.handed_back_at && s.notes ? (
              <p className="rounded-control bg-tl-bg p-3 text-body text-tl-text-2">{s.notes}</p>
            ) : null}

            {open && isAnalyst && !s.accepted_at && (mine || !s.analyst_id) ? <AcceptButton sessionId={s.id} /> : null}
            {open && isAnalyst && mine && s.accepted_at ? (
              <>
                <ScheduleForm session={s} />
                <OutcomeForm session={s} stage={stage} />
              </>
            ) : null}
            {open && ownsLead ? (
              <div className="flex justify-end border-t border-tl-line pt-3">
                <CancelForm sessionId={s.id} />
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
