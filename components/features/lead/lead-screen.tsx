"use client";

import {
  ArrowRightLeft,
  CalendarClock,
  Info,
  MessageCircle,
  Phone,
  PhoneCall,
  StickyNote,
  UserRoundCheck,
} from "lucide-react";
import { useActionState, useState, type CSSProperties } from "react";
import {
  addNote,
  confirmInvalid,
  logWhatsApp,
  moveStage,
  rejectInvalid,
  returnToPool,
} from "@/app/(app)/lead/[id]/actions";
import { FollowUpPicker } from "@/components/features/calls/follow-up-picker";
import { LogCallSheet } from "@/components/features/calls/log-call-sheet";
import { DepositSheet } from "@/components/features/deposits/deposit-sheet";
import { DepositsPanel, type DepositRow } from "@/components/features/deposits/deposits-panel";
import type { DocumentRow } from "@/components/features/kyc/checklist";
import { DocumentsPanel, type BrokerOption, type KycProfileRow } from "@/components/features/kyc/documents-panel";
import { ReferSheet, type AnalystLoad } from "@/components/features/sessions/refer-sheet";
import { SessionPanel, type SessionRow } from "@/components/features/sessions/session-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { StageChip } from "@/components/ui/stage-chip";
import { Tabs } from "@/components/ui/tabs";
import { describeWhen, formatKarachi, timeAgo } from "@/lib/format/dates";
import { formatPhone } from "@/lib/format/phone";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { isOpenStage, MOVE_BUTTONS, OUTCOME_LABEL, type CallOutcome } from "@/lib/leads/stage-machine";
import { canRefer } from "@/lib/sessions/rules";
import { STAGE_LABEL, type Stage } from "@/lib/leads/stages";
import { teamColorVar, type TeamColor } from "@/lib/teams";
import { cn } from "@/lib/utils";

export type LeadView = {
  id: string;
  full_name: string;
  phone: string;
  city: string | null;
  source: string;
  campaign: string | null;
  notes: string | null;
  stage: Stage;
  team_id: string | null;
  agent_id: string | null;
  next_follow_up_at: string | null;
  no_answer_count: number;
  close_reason: string | null;
  invalid_confirmed_by: string | null;
  returned_to_lead: boolean;
  agent_assigned_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  created_by: string | null;
  credited_analyst_id: string | null;
  team: { name: string; color: TeamColor; team_lead_id: string } | null;
};

export type TimelineItem =
  | {
      kind: "activity";
      id: string;
      created_at: string;
      user_id: string | null;
      type: "call" | "whatsapp" | "note" | "stage_change" | "system";
      outcome: CallOutcome | null;
      from_stage: Stage | null;
      to_stage: Stage | null;
      notes: string | null;
    }
  | {
      kind: "move";
      id: string;
      created_at: string;
      from_user: string | null;
      to_user: string | null;
      from_team: string | null;
      to_team: string | null;
      assigned_by: string | null;
      reason: string | null;
    };

type Viewer = { id: string; canWork: boolean; ownsLead: boolean; isAnalyst: boolean; canConfirmInvalid: boolean; isAdmin: boolean };
export type DepositInfo = { brokerName: string | null; analystName: string | null; cashLimit: number; today: string; kycReady: boolean };
type Settings = { maxTries: number; firstCallHours: number; coolingOffDays: number; reasons: { notInterested: string[]; invalid: string[] } };

// ---------------------------------------------------------------------------
// Stage tracker
// ---------------------------------------------------------------------------

const STEPS: { label: string; stages: Stage[]; optional?: boolean }[] = [
  { label: "Assigned", stages: ["new", "assigned"] },
  { label: "Contacted", stages: ["no_answer", "follow_up"] },
  { label: "Interested", stages: ["interested"] },
  { label: "Analysis", stages: ["with_analyst", "post_session"], optional: true },
  { label: "Documents", stages: ["documents_pending"] },
  { label: "Deposit", stages: ["deposit_recorded"] },
  { label: "Verified", stages: ["deposit_verified"] },
];

function StageTracker({ stage }: { stage: Stage }) {
  const current = STEPS.findIndex((s) => s.stages.includes(stage));
  const closed = current < 0;
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="Lead progress">
      {STEPS.map((s, i) => {
        const done = !closed && i < current;
        const here = i === current;
        const vars = { "--bar-h": "10px" } as CSSProperties;
        return (
          <li key={s.label} className="flex flex-col gap-2" aria-current={here ? "step" : undefined}>
            <span
              style={vars}
              className={cn(
                "h-2.5 w-full",
                here ? "tl-slant bg-tl-primary" : done ? "rounded-full bg-tl-primary/40" : "rounded-full bg-tl-raised",
              )}
            />
            <span className={cn("text-small", here ? "font-semibold text-tl-text" : done ? "text-tl-text-2" : "text-tl-muted")}>
              {s.label}
              {s.optional ? <span className="text-tl-muted"> (optional)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Next action
// ---------------------------------------------------------------------------

function nextAction(lead: LeadView, firstCallHours: number, now = new Date()): { tone: "danger" | "wait" | "plain"; text: string } {
  if (lead.stage === "not_interested") return { tone: "plain", text: `Closed: not interested. ${lead.close_reason ?? ""}`.trim() };
  if (lead.stage === "invalid") {
    return lead.invalid_confirmed_by
      ? { tone: "plain", text: `Closed: invalid. ${lead.close_reason ?? ""}`.trim() }
      : { tone: "wait", text: `Marked invalid (${lead.close_reason ?? "no reason"}). Waiting for confirmation.` };
  }
  if (lead.stage === "deposit_verified") return { tone: "plain", text: "Funded client. Top-ups are recorded on the Deposits tab." };
  if (lead.stage === "new") return { tone: "plain", text: "In the pool, waiting to be sent to a team." };
  if (!lead.agent_id) {
    return { tone: "wait", text: lead.returned_to_lead ? "Back with the Team Lead to reassign." : "Waiting for the Team Lead to assign an agent." };
  }
  if (!lead.last_activity_at && lead.agent_assigned_at) {
    const due = new Date(new Date(lead.agent_assigned_at).getTime() + firstCallHours * 3_600_000);
    return due < now
      ? { tone: "danger", text: `Overdue: the first call was due ${timeAgo(due, now)} ago.` }
      : { tone: "wait", text: `First call due ${describeWhen(due, now)}.` };
  }
  if (lead.next_follow_up_at) {
    const due = new Date(lead.next_follow_up_at);
    return due < now
      ? { tone: "danger", text: `Overdue: the follow-up was due ${describeWhen(due, now)}.` }
      : { tone: "plain", text: `Next follow-up ${describeWhen(due, now)}.` };
  }
  return { tone: "plain", text: "No follow-up booked." };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function TimelineEntry({ item, names, teamNames }: { item: TimelineItem; names: Record<string, string>; teamNames: Record<string, string> }) {
  const who = (id: string | null) => (id ? (names[id] ?? "Someone") : "The system");
  let Icon = Info;
  let title: React.ReactNode;
  let body: string | null = null;

  if (item.kind === "move") {
    Icon = UserRoundCheck;
    if (item.to_team && item.from_team !== item.to_team) {
      title = `Sent to ${teamNames[item.to_team] ?? "a team"}`;
    } else if (!item.to_team && item.from_team) {
      title = "Back to the pool";
    } else if (item.to_user) {
      title = `Assigned to ${who(item.to_user)}`;
    } else {
      title = `Back with the Team Lead`;
    }
    body = item.reason;
    return (
      <Entry Icon={Icon} title={title} by={item.assigned_by ? `by ${who(item.assigned_by)}` : null} at={item.created_at} body={body} />
    );
  }

  if (item.type === "call") {
    Icon = PhoneCall;
    title = `Call: ${item.outcome ? OUTCOME_LABEL[item.outcome] : "logged"}`;
  } else if (item.type === "whatsapp") {
    Icon = MessageCircle;
    title = "WhatsApp opened";
  } else if (item.type === "note") {
    Icon = StickyNote;
    title = "Note";
  } else if (item.type === "stage_change") {
    Icon = ArrowRightLeft;
    title = item.to_stage ? `Moved to ${STAGE_LABEL[item.to_stage]}` : "Stage updated";
  } else {
    title = item.notes ?? "Update";
  }
  body = item.type === "system" || item.type === "whatsapp" ? null : item.notes;
  return (
    <Entry
      Icon={Icon}
      title={title}
      by={`by ${who(item.user_id)}`}
      at={item.created_at}
      body={body}
      change={item.from_stage && item.to_stage ? [item.from_stage, item.to_stage] : null}
    />
  );
}

function Entry({
  Icon,
  title,
  by,
  at,
  body,
  change,
}: {
  Icon: typeof Info;
  title: React.ReactNode;
  by: string | null;
  at: string;
  body: string | null;
  change?: [Stage, Stage] | null;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span aria-hidden className="absolute top-8 bottom-0 left-4 w-px bg-tl-line last:hidden" />
      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-tl-line bg-tl-surface text-tl-primary">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-body font-semibold text-tl-text">
            {title} {by ? <span className="font-normal text-tl-muted">{by}</span> : null}
          </p>
          <time dateTime={at} title={formatKarachi(at)} className="shrink-0 text-small text-tl-muted">
            {timeAgo(at)}
          </time>
        </div>
        {change ? (
          <p className="flex flex-wrap items-center gap-1.5 text-small text-tl-muted">
            <StageChip stage={change[0]} /> <span aria-hidden>to</span> <StageChip stage={change[1]} />
          </p>
        ) : null}
        {body ? <p className="whitespace-pre-wrap text-body text-tl-text-2">{body}</p> : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Side actions
// ---------------------------------------------------------------------------

function MoveSheet({ lead, to, label, onClose }: { lead: LeadView; to: Stage | null; label: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(moveStage, null);
  const [followUp, setFollowUp] = useState<Date | null>(null);
  useActionToast(state, onClose);
  return (
    <Sheet
      open={to !== null}
      onClose={onClose}
      title={label}
      description={to ? `${STAGE_LABEL[lead.stage]} to ${STAGE_LABEL[to]}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="move-form" disabled={pending}>
            {pending ? "Saving" : label}
          </Button>
        </>
      }
    >
      <form id="move-form" action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="leadId" value={lead.id} />
        <input type="hidden" name="stage" value={lead.stage} />
        <input type="hidden" name="to" value={to ?? ""} />
        <FollowUpPicker value={followUp} onChange={setFollowUp} error={state?.fieldErrors?.followUpAt?.[0]} />
        <div className="flex flex-col gap-1">
          <label htmlFor="move-notes" className="text-label font-medium text-tl-text">
            Notes (optional)
          </label>
          <textarea id="move-notes" name="notes" rows={3} maxLength={2000} className="rounded-control border border-tl-line-strong bg-tl-surface px-3 py-2 text-body text-tl-text" />
        </div>
      </form>
    </Sheet>
  );
}

function RejectInvalidSheet({ lead, open, onClose }: { lead: LeadView; open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState(rejectInvalid, null);
  const [followUp, setFollowUp] = useState<Date | null>(null);
  useActionToast(state, onClose);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Reject the Invalid mark"
      description="The lead goes back to Follow-up with the same agent. Book when they should call."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="reject-form" disabled={pending}>
            {pending ? "Saving" : "Reject and send back"}
          </Button>
        </>
      }
    >
      <form id="reject-form" action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="leadId" value={lead.id} />
        <FollowUpPicker value={followUp} onChange={setFollowUp} error={state?.fieldErrors?.followUpAt?.[0]} />
        <div className="flex flex-col gap-1">
          <label htmlFor="reject-notes" className="text-label font-medium text-tl-text">
            Note for the agent (optional)
          </label>
          <textarea id="reject-notes" name="notes" rows={3} maxLength={2000} className="rounded-control border border-tl-line-strong bg-tl-surface px-3 py-2 text-body text-tl-text" />
        </div>
      </form>
    </Sheet>
  );
}

function FormButton({
  action,
  leadId,
  label,
  variant = "secondary",
}: {
  action: typeof confirmInvalid;
  leadId: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const [state, run, pending] = useActionState(action, null);
  useActionToast(state);
  return (
    <form action={run}>
      <input type="hidden" name="leadId" value={leadId} />
      <Button type="submit" variant={variant} block disabled={pending}>
        {label}
      </Button>
    </form>
  );
}

function NoteForm({ lead, toAgent }: { lead: LeadView; toAgent: boolean }) {
  const [state, action, pending] = useActionState(addNote, null);
  const [text, setText] = useState("");
  useActionToast(state, () => setText(""));
  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="leadId" value={lead.id} />
      <input type="hidden" name="stage" value={lead.stage} />
      <label htmlFor="lead-note" className="text-label font-medium text-tl-text">
        {toAgent ? "Leave a note for the agent" : "Add a note"}
      </label>
      <textarea
        id="lead-note"
        name="notes"
        rows={3}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={toAgent ? "They get a notification" : "Only people who can see this lead can read it"}
        className="rounded-control border border-tl-line-strong bg-tl-surface px-3 py-2 text-body text-tl-text placeholder:text-tl-muted"
      />
      {state?.fieldErrors?.notes ? <p className="text-small font-medium text-tl-danger">{state.fieldErrors.notes[0]}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !text.trim()}>
          {toAgent ? "Send note" : "Add note"}
        </Button>
      </div>
    </form>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-tl-line py-2.5 last:border-b-0">
      <dt className="text-label text-tl-muted">{label}</dt>
      <dd className="text-right text-body text-tl-text">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type Panel = "timeline" | "session" | "documents" | "deposits";

export function LeadScreen({
  lead,
  timeline,
  names,
  teamNames,
  viewer,
  settings,
  sessions,
  analysts,
  kyc,
  documents,
  brokers,
  deposits,
  depositInfo,
}: {
  lead: LeadView;
  timeline: TimelineItem[];
  names: Record<string, string>;
  teamNames: Record<string, string>;
  viewer: Viewer;
  settings: Settings;
  sessions: SessionRow[];
  analysts: AnalystLoad[];
  kyc: KycProfileRow | null;
  documents: DocumentRow[];
  brokers: BrokerOption[];
  deposits: DepositRow[];
  depositInfo: DepositInfo;
}) {
  // Analysts come here for the session, and never see documents or deposits.
  const [panel, setPanel] = useState<Panel>(viewer.isAnalyst ? "session" : "timeline");
  const [referring, setReferring] = useState(0);
  const openSession = sessions.some((x) => !x.handed_back_at && !x.cancelled_at);
  const mayRefer = viewer.ownsLead && canRefer(lead.stage) && !openSession;
  const [calling, setCalling] = useState(0);
  const [recording, setRecording] = useState(0);
  const [move, setMove] = useState<{ to: Stage; label: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const open = isOpenStage(lead.stage);
  const canCall = viewer.canWork && open && !!lead.agent_id;
  const next = nextAction(lead, settings.firstCallHours);
  const waitingInvalid = lead.stage === "invalid" && !lead.invalid_confirmed_by;
  const moves = (MOVE_BUTTONS[lead.stage] ?? []).filter((m) => viewer.ownsLead && (m.to !== "with_analyst" || mayRefer));
  const whatsapp = `https://wa.me/${lead.phone.replace(/\D/g, "")}`;
  const agentName = lead.agent_id ? names[lead.agent_id] : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="tl-display text-display-m text-tl-text">{lead.full_name}</h1>
          <StageChip stage={lead.stage} />
          {waitingInvalid ? (
            <span className="rounded-full border border-tl-wait/40 bg-tl-wait/10 px-2.5 py-0.5 text-small font-semibold text-tl-wait">
              Waiting for confirmation
            </span>
          ) : null}
          {lead.returned_to_lead && !lead.agent_id ? (
            <span className="rounded-full border border-tl-line-strong px-2.5 py-0.5 text-small font-semibold text-tl-text-2">Returned</span>
          ) : null}
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-body text-tl-muted">
          {lead.team ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: teamColorVar(lead.team.color) }} />
              {lead.team.name}
            </span>
          ) : (
            <span>In the pool</span>
          )}
          <span>{agentName ? `With ${agentName}` : "No agent yet"}</span>
        </p>
      </header>

      {/* Contact strip and next action */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <a href={`tel:${lead.phone}`} className="tl-display tl-amount mr-auto text-title text-tl-text hover:text-tl-link">
            {formatPhone(lead.phone)}
          </a>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void logWhatsApp(lead.id, lead.stage)}
            className={buttonVariants({ variant: "secondary" })}
          >
            <MessageCircle aria-hidden className="size-4" />
            WhatsApp
          </a>
          <Button onClick={() => setCalling((n) => n + 1)} disabled={!canCall} title={canCall ? undefined : "Only the lead's agent, Team Lead or an Admin can log calls on an open, assigned lead."}>
            <Phone aria-hidden className="size-4" />
            Call
          </Button>
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-control border px-4 py-3",
            next.tone === "danger" && "border-tl-danger/30 bg-tl-danger/5",
            next.tone === "wait" && "border-tl-wait/30 bg-tl-wait/5",
            next.tone === "plain" && "border-tl-line bg-tl-bg",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-2 text-body font-semibold",
              next.tone === "danger" ? "text-tl-danger" : next.tone === "wait" ? "text-tl-wait" : "text-tl-text",
            )}
          >
            <CalendarClock aria-hidden className="size-4" />
            {next.text}
          </p>
          {canCall ? (
            <Button size="sm" onClick={() => setCalling((n) => n + 1)}>
              Log a call
            </Button>
          ) : null}
        </div>
        <StageTracker stage={lead.stage} />
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Tabs
            idPrefix="lead"
            label="Lead sections"
            value={panel}
            onChange={setPanel}
            items={[
              { value: "timeline" as Panel, label: "Timeline", count: timeline.length },
              { value: "session" as Panel, label: "Session", count: sessions.length || undefined },
              ...(viewer.isAnalyst
                ? []
                : [
                    { value: "documents" as Panel, label: "Documents" },
                    { value: "deposits" as Panel, label: "Deposits" },
                  ]),
            ]}
          />
          <section id={`lead-panel-${panel}`} role="tabpanel" aria-labelledby={`lead-tab-${panel}`}>
            {panel === "timeline" ? (
              timeline.length > 0 ? (
                <Card>
                  <ol aria-label="Timeline">
                    {timeline.map((t) => (
                      <TimelineEntry key={`${t.kind}-${t.id}`} item={t} names={names} teamNames={teamNames} />
                    ))}
                  </ol>
                </Card>
              ) : (
                <EmptyState title="Nothing has happened yet." body="Calls, notes and moves appear here, newest first." />
              )
            ) : panel === "session" ? (
              <SessionPanel
                sessions={sessions}
                names={names}
                stage={lead.stage}
                viewerId={viewer.id}
                isAnalyst={viewer.isAnalyst}
                ownsLead={viewer.ownsLead}
                canRefer={mayRefer}
                onRefer={() => setReferring((n) => n + 1)}
              />
            ) : panel === "documents" ? (
              <DocumentsPanel
                leadId={lead.id}
                stage={lead.stage}
                profile={kyc}
                documents={documents}
                brokers={brokers}
                canEdit={viewer.ownsLead}
                isAdmin={viewer.isAdmin}
                onRecordDeposit={() => {
                  setPanel("deposits");
                  setRecording((n) => n + 1);
                }}
              />
            ) : (
              <DepositsPanel
                deposits={deposits}
                stage={lead.stage}
                kycReady={depositInfo.kycReady}
                canRecord={viewer.ownsLead}
                onRecord={() => setRecording((n) => n + 1)}
              />
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {waitingInvalid && viewer.canConfirmInvalid ? (
            <Card className="flex flex-col gap-3 border-tl-wait/40">
              <CardHeader
                className="mb-1"
                title="Confirm the Invalid mark?"
                description={`Reason given: ${lead.close_reason ?? "none"}.`}
              />
              <FormButton action={confirmInvalid} leadId={lead.id} label="Confirm invalid" variant="primary" />
              <Button variant="secondary" block onClick={() => setRejecting(true)}>
                Reject, back to follow-up
              </Button>
            </Card>
          ) : null}

          {moves.length > 0 ? (
            <Card className="flex flex-col gap-2">
              <CardHeader className="mb-2" title="Move this lead" />
              {moves.map((m) =>
                m.to === "deposit_recorded" ? (
                  <Button key={m.to} variant="secondary" block disabled={!depositInfo.kycReady} title={depositInfo.kycReady ? undefined : "Complete every document and detail first."} onClick={() => {
                    setPanel("deposits");
                    setRecording((n) => n + 1);
                  }}>
                    {m.label}
                  </Button>
                ) : m.module ? (
                  <Button key={m.to} variant="secondary" block disabled title={`Arrives in Module ${m.module}`}>
                    {m.label} (Module {m.module})
                  </Button>
                ) : (
                  <Button
                    key={m.to}
                    variant="secondary"
                    block
                    onClick={() => (m.to === "with_analyst" ? setReferring((n) => n + 1) : setMove({ to: m.to, label: m.label }))}
                  >
                    {m.label}
                  </Button>
                ),
              )}
            </Card>
          ) : null}

          {lead.stage === "not_interested" && viewer.isAdmin ? (
            <Card className="flex flex-col gap-2">
              <CardHeader
                className="mb-1"
                title="Cooling off"
                description={`After ${settings.coolingOffDays} days a Not interested lead can go back to the pool.`}
              />
              <FormButton action={returnToPool} leadId={lead.id} label="Return to the pool" />
            </Card>
          ) : null}

          {viewer.canWork ? (
            <Card>
              <NoteForm lead={lead} toAgent={!!lead.agent_id && lead.agent_id !== viewer.id} />
            </Card>
          ) : null}

          <Card>
            <CardHeader className="mb-1" title="Details" />
            <dl>
              <Detail label="Source">{lead.source}</Detail>
              <Detail label="Campaign">{lead.campaign ?? "None"}</Detail>
              <Detail label="City">{lead.city ?? "Not given"}</Detail>
              <Detail label="No answer">
                <span className="tl-amount">
                  {lead.no_answer_count} of {settings.maxTries}
                </span>
              </Detail>
              <Detail label="Added">{formatKarachi(lead.created_at, "date")}</Detail>
              <Detail label="Added by">{lead.created_by ? (names[lead.created_by] ?? "Someone") : "Import"}</Detail>
            </dl>
            {lead.notes ? <p className="mt-3 rounded-control bg-tl-bg p-3 text-body text-tl-text-2">{lead.notes}</p> : null}
          </Card>
        </aside>
      </div>

      <LogCallSheet
        key={`call-${calling}`}
        lead={calling > 0 ? lead : null}
        reasons={settings.reasons}
        open={calling > 0}
        onClose={() => setCalling(0)}
      />
      <MoveSheet key={`move-${move?.to ?? "none"}`} lead={lead} to={move?.to ?? null} label={move?.label ?? ""} onClose={() => setMove(null)} />
      <RejectInvalidSheet key={`reject-${rejecting}`} lead={lead} open={rejecting} onClose={() => setRejecting(false)} />
      <DepositSheet
        key={`deposit-${recording}`}
        lead={lead}
        brokerName={depositInfo.brokerName ?? "the chosen broker"}
        analystName={depositInfo.analystName}
        isTopUp={deposits.some((d) => d.status === "pending" || d.status === "verified")}
        cashLimit={depositInfo.cashLimit}
        today={depositInfo.today}
        open={recording > 0}
        onClose={() => setRecording(0)}
      />
      <ReferSheet key={`refer-${referring}`} lead={lead} analysts={analysts} open={referring > 0} onClose={() => setReferring(0)} />
    </div>
  );
}
