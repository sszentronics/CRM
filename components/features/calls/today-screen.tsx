"use client";

import { AlertTriangle, FileWarning, PhoneCall } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StageChip } from "@/components/ui/stage-chip";
import { describeWhen, karachiDayBounds, timeAgo } from "@/lib/format/dates";
import { formatPhone } from "@/lib/format/phone";
import { documentLabel } from "@/lib/brokers/documents";
import type { Stage } from "@/lib/leads/stages";
import { cn } from "@/lib/utils";
import { LogCallSheet, type CallReasons, type CallTarget } from "./log-call-sheet";

export type TodayLead = {
  id: string;
  full_name: string;
  phone: string;
  stage: Stage;
  source: string;
  next_follow_up_at: string | null;
  agent_assigned_at: string | null;
  last_activity_at: string | null;
  no_answer_count: number;
};

type Row = TodayLead & { due: Date | null; late: boolean };

export type DocToFix = {
  id: string;
  type: string;
  reject_reason: string | null;
  reviewed_at: string | null;
  kyc: { lead: { id: string; full_name: string } } | null;
};

/** Split the agent's open leads into Overdue, Due today and New (never called). Each lead appears once. */
export function sortToday(leads: TodayLead[], firstCallHours: number, now = new Date()) {
  const { end } = karachiDayBounds(now);
  const overdue: Row[] = [];
  const today: Row[] = [];
  const fresh: Row[] = [];
  for (const l of leads) {
    if (!l.last_activity_at) {
      const due = l.agent_assigned_at ? new Date(new Date(l.agent_assigned_at).getTime() + firstCallHours * 3_600_000) : null;
      fresh.push({ ...l, due, late: !!due && due < now });
      continue;
    }
    if (!l.next_follow_up_at) continue;
    const due = new Date(l.next_follow_up_at);
    if (due < now) overdue.push({ ...l, due, late: true });
    else if (due < end) today.push({ ...l, due, late: false });
  }
  overdue.sort((a, b) => a.due!.getTime() - b.due!.getTime());
  today.sort((a, b) => a.due!.getTime() - b.due!.getTime());
  fresh.sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
  return { overdue, today, fresh };
}

function Tile({ href, count, label, danger }: { href: string; count: number; label: string; danger?: boolean }) {
  return (
    <a
      href={href}
      className={cn(
        "flex flex-col gap-1 rounded-card border border-l-4 border-tl-line bg-tl-surface p-4 shadow-card hover:border-tl-line-strong",
        danger && count > 0 ? "border-l-tl-danger" : "border-l-tl-primary",
      )}
    >
      <span className={cn("tl-display tl-amount text-display-l", danger && count > 0 ? "text-tl-danger" : "text-tl-text")}>{count}</span>
      <span className="text-label text-tl-muted">{label}</span>
    </a>
  );
}

function CallRow({ row, kind, onCall }: { row: Row; kind: "overdue" | "today" | "new"; onCall: () => void }) {
  let when: string;
  if (kind === "new") when = row.due ? (row.late ? `First call overdue by ${timeAgo(row.due)}` : `First call due ${describeWhen(row.due)}`) : "Call when you can";
  else if (kind === "overdue") when = `Was due ${describeWhen(row.due!)}`;
  else when = `Due ${describeWhen(row.due!)}`;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-l-4 bg-tl-surface px-4 py-3 shadow-card",
        row.late ? "border-tl-danger/30 border-l-tl-danger" : "border-tl-line border-l-tl-line-strong",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <Link href={`/lead/${row.id}`} className="text-body font-semibold text-tl-text hover:text-tl-link hover:underline">
            {row.full_name}
          </Link>
          <StageChip stage={row.stage} />
          {row.late ? (
            <span className="inline-flex items-center gap-1 text-small font-semibold text-tl-danger">
              <AlertTriangle aria-hidden className="size-3.5" />
              Overdue
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap gap-x-3 text-small text-tl-muted">
          <span className={cn(row.late && "font-semibold text-tl-danger")}>{when}</span>
          <span className="tl-amount">{formatPhone(row.phone)}</span>
          <span>{row.source}</span>
          {row.no_answer_count > 0 ? <span>{row.no_answer_count} no answer</span> : null}
        </span>
      </div>
      <Button size="sm" onClick={onCall} aria-label={`Log a call with ${row.full_name}`}>
        <PhoneCall aria-hidden className="size-4" />
        Log call
      </Button>
    </li>
  );
}

function Section({ id, title, rows, kind, onCall }: { id: string; title: string; rows: Row[]; kind: "overdue" | "today" | "new"; onCall: (r: Row) => void }) {
  if (rows.length === 0) return null;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-3">
      <h2 id={`${id}-title`} className={cn("text-title font-semibold", kind === "overdue" ? "text-tl-danger" : "text-tl-text")}>
        {title}
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <CallRow key={r.id} row={r} kind={kind} onCall={() => onCall(r)} />
        ))}
      </ul>
    </section>
  );
}

export function TodayScreen({
  firstName,
  leads,
  callsToday,
  firstCallHours,
  reasons,
  docsToFix = [],
}: {
  firstName: string;
  leads: TodayLead[];
  callsToday: number;
  docsToFix?: DocToFix[];
  firstCallHours: number;
  reasons: CallReasons;
}) {
  const { overdue, today, fresh } = useMemo(() => sortToday(leads, firstCallHours), [leads, firstCallHours]);
  const [target, setTarget] = useState<CallTarget | null>(null);
  const [opened, setOpened] = useState(0);
  const left = overdue.length + today.length + fresh.length + docsToFix.length;

  function call(r: Row) {
    setTarget({ id: r.id, full_name: r.full_name, phone: r.phone, stage: r.stage });
    setOpened((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Today's calls"
        description={left > 0 ? `${firstName}, you have ${left} ${left === 1 ? "call" : "calls"} to make today.` : undefined}
      />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Tile href="#overdue" count={overdue.length} label="Overdue" danger />
        <Tile href="#due-today" count={today.length} label="Due today" />
        <Tile href="#new-leads" count={fresh.length} label="New leads" />
        <Tile href="#due-today" count={callsToday} label="Calls made today" />
      </div>

      {left === 0 ? (
        <EmptyState title="All clear. No calls left today." body="New leads and follow-ups appear here as soon as they are due." />
      ) : (
        <>
          <Section id="overdue" title={`${overdue.length} overdue. Start here.`} rows={overdue} kind="overdue" onCall={call} />
          {docsToFix.length > 0 ? (
            <section id="documents-to-fix" aria-labelledby="documents-to-fix-title" className="flex scroll-mt-24 flex-col gap-3">
              <h2 id="documents-to-fix-title" className="text-title font-semibold text-tl-danger">
                Documents to fix
              </h2>
              <ul className="flex flex-col gap-2">
                {docsToFix.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-l-4 border-tl-danger/30 border-l-tl-danger bg-tl-surface px-4 py-3 shadow-card"
                  >
                    <FileWarning aria-hidden className="size-4 text-tl-danger" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-body font-semibold text-tl-text">
                        {d.kyc?.lead.full_name}: {documentLabel(d.type)}
                      </span>
                      <span className="text-small font-semibold text-tl-danger">Rejected: {d.reject_reason}</span>
                    </div>
                    <Link
                      href={`/lead/${d.kyc?.lead.id}`}
                      className="inline-flex h-8 items-center rounded-control border border-tl-line-strong bg-tl-surface px-3 text-label font-semibold text-tl-text hover:bg-tl-raised"
                    >
                      Open documents
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <Section id="due-today" title="Due today" rows={today} kind="today" onCall={call} />
          <Section id="new-leads" title="New leads" rows={fresh} kind="new" onCall={call} />
        </>
      )}

      <LogCallSheet key={opened} lead={target} reasons={reasons} open={target !== null} onClose={() => setTarget(null)} />
    </div>
  );
}
