"use client";

import { Split } from "lucide-react";
import { useState, useTransition } from "react";
import { assignLeads, splitEvenly } from "@/app/(app)/team/assign/actions";
import { FormMessage } from "@/components/features/auth/form-message";
import { PageHeader } from "@/components/features/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { StageChip } from "@/components/ui/stage-chip";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/format/dates";
import { formatPhone } from "@/lib/format/phone";
import type { Stage } from "@/lib/leads/stages";
import { PickTable, type PickColumn } from "./pick-table";

export type TeamLeadRow = {
  id: string;
  full_name: string;
  phone: string;
  source: string;
  stage: Stage;
  agent_id: string | null;
  returned_to_lead: boolean;
  agent_assigned_at: string | null;
  created_at: string;
};

export type Person = {
  id: string;
  name: string;
  photo: string | null;
  isLead: boolean;
  isMe: boolean;
  open: number;
  today: number;
};

type Panel = "unassigned" | "assigned";
const firstName = (n: string) => n.split(" ")[0];

export function AssignScreen({ teamName, leads, people }: { teamName: string; leads: TeamLeadRow[]; people: Person[] }) {
  const toast = useToast();
  const [panel, setPanel] = useState<Panel>("unassigned");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitWith, setSplitWith] = useState<Set<string>>(new Set(people.filter((p) => !p.isLead).map((p) => p.id)));
  const [reassignTo, setReassignTo] = useState(people.find((p) => !p.isLead)?.id ?? people[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unassigned = leads.filter((l) => !l.agent_id);
  const assigned = leads.filter((l) => l.agent_id);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const ids = [...selected];

  function switchPanel(p: Panel) {
    setPanel(p);
    setSelected(new Set());
    setReasonError(null);
  }

  function assignTo(person: Person) {
    start(async () => {
      const r = await assignLeads(ids, person.id);
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) setSelected(new Set());
    });
  }

  function runSplit() {
    start(async () => {
      const r = await splitEvenly(ids, [...splitWith]);
      setSplitOpen(false);
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) setSelected(new Set());
    });
  }

  function reassign() {
    // Checked here for a quick answer, and again in the database.
    if (!reason.trim()) {
      setReasonError("Give a reason for reassigning a lead.");
      return;
    }
    setReasonError(null);
    start(async () => {
      const r = await assignLeads(ids, reassignTo, reason);
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) {
        setSelected(new Set());
        setReason("");
      }
    });
  }

  const baseColumns: PickColumn<TeamLeadRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-semibold text-tl-text">{r.full_name}</span>
          {r.returned_to_lead ? (
            <span className="rounded-full border border-tl-line-strong px-2 text-small font-semibold text-tl-text-2">Returned</span>
          ) : null}
        </span>
      ),
    },
    { key: "phone", header: "Phone", cell: (r) => <span className="tl-amount">{formatPhone(r.phone)}</span> },
    { key: "source", header: "Source", cell: (r) => r.source },
    { key: "stage", header: "Stage", cell: (r) => <StageChip stage={r.stage} /> },
  ];
  const unassignedColumns: PickColumn<TeamLeadRow>[] = [
    ...baseColumns,
    { key: "age", header: "Waiting", align: "right", cell: (r) => <span className="text-tl-muted">{timeAgo(r.created_at)}</span> },
  ];
  const assignedColumns: PickColumn<TeamLeadRow>[] = [
    ...baseColumns,
    { key: "agent", header: "With", cell: (r) => nameOf.get(r.agent_id!) ?? "Someone else" },
  ];

  const splitPeople = people.filter((p) => splitWith.has(p.id));
  const perPerson = splitPeople.length ? Math.floor(selected.size / splitPeople.length) : 0;
  const extra = splitPeople.length ? selected.size % splitPeople.length : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assign leads"
        description={`${teamName}: give each new lead to an agent. The first-call countdown starts when you assign it.`}
      />
      <Tabs
        idPrefix="assign"
        label="Team leads"
        value={panel}
        onChange={switchPanel}
        items={[
          { value: "unassigned", label: "Unassigned", count: unassigned.length },
          { value: "assigned", label: "Assigned", count: assigned.length },
        ]}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
        <section id={`assign-panel-${panel}`} role="tabpanel" aria-labelledby={`assign-tab-${panel}`} className="min-w-0">
          <PickTable
            rows={panel === "unassigned" ? unassigned : assigned}
            columns={panel === "unassigned" ? unassignedColumns : assignedColumns}
            selected={selected}
            onChange={setSelected}
            caption={panel === "unassigned" ? "Unassigned team leads" : "Assigned team leads"}
            rowLabel={(r) => r.full_name}
            empty={
              <EmptyState
                title={panel === "unassigned" ? "Every lead has someone." : "No leads are assigned yet."}
                body={
                  panel === "unassigned"
                    ? "New leads from the Admin land here, with leads returned after too many unanswered calls."
                    : "Assign leads from the Unassigned tab."
                }
              />
            }
          />
        </section>

        <aside className="sticky top-20 flex flex-col gap-4 rounded-card border border-tl-line bg-tl-surface p-5 shadow-card">
          <div className="flex items-baseline justify-between">
            <h2 className="text-title font-semibold text-tl-text">Your team</h2>
            <span className="text-label text-tl-muted">
              <span className="tl-amount font-semibold text-tl-text">{selected.size}</span> ticked
            </span>
          </div>

          {panel === "unassigned" ? (
            <>
              <ul className="flex flex-col gap-2" aria-label="People to assign to">
                {people.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-control border border-tl-line px-3 py-2">
                    <Avatar name={p.name} src={p.photo} size={28} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-semibold text-tl-text">
                        {p.name}
                        {p.isMe ? <span className="font-normal text-tl-muted"> (you)</span> : null}
                      </span>
                      <span className="text-small text-tl-muted">
                        {p.open} open, {p.today} today
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || selected.size === 0}
                      onClick={() => assignTo(p)}
                      aria-label={`Assign ticked leads to ${p.isMe ? "me" : p.name}`}
                    >
                      Assign
                    </Button>
                  </li>
                ))}
              </ul>
              <Button onClick={() => setSplitOpen(true)} disabled={pending || selected.size === 0}>
                <Split aria-hidden className="size-4" />
                Split evenly
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
                Reassign to
                <select
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                  className="h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.isMe ? `${p.name} (you)` : p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
                Reason
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={300}
                  placeholder="For example: agent on leave"
                  aria-invalid={reasonError ? true : undefined}
                  className="h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text placeholder:text-tl-muted aria-invalid:border-tl-danger"
                />
              </label>
              {reasonError ? <FormMessage tone="error">{reasonError}</FormMessage> : null}
              <Button onClick={reassign} disabled={pending || selected.size === 0}>
                Reassign {selected.size > 0 ? selected.size : ""} {selected.size === 1 ? "lead" : "leads"}
              </Button>
            </div>
          )}
        </aside>
      </div>

      <Sheet
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        title="Split evenly"
        description="Each person gets the same number of leads, with sources mixed fairly."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSplitOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runSplit} disabled={pending || splitWith.size === 0}>
              {pending ? "Assigning" : `Split ${selected.size} leads`}
            </Button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-medium text-tl-text">Split between</legend>
          {people.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-control border border-tl-line px-3 py-2 hover:bg-tl-bg">
              <input
                type="checkbox"
                checked={splitWith.has(p.id)}
                onChange={() =>
                  setSplitWith((s) => {
                    const next = new Set(s);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  })
                }
                className="size-4 accent-[var(--tl-primary)]"
              />
              <span className="flex-1 text-body text-tl-text">
                {p.name}
                {p.isMe ? " (you)" : ""}
              </span>
              <span className="text-small text-tl-muted">{p.open} open</span>
            </label>
          ))}
        </fieldset>
        {splitPeople.length > 0 ? (
          <p className="mt-4 text-body text-tl-text-2">
            {extra === 0
              ? `${perPerson} leads each.`
              : `${perPerson} or ${perPerson + 1} leads each.`}{" "}
            {splitPeople.filter((p) => !p.isMe).length > 0
              ? `${splitPeople
                  .filter((p) => !p.isMe)
                  .map((p) => firstName(p.name))
                  .join(", ")} will each get a notification.`
              : ""}
          </p>
        ) : null}
      </Sheet>
    </div>
  );
}
