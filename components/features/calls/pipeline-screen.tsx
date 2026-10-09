"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { describeWhen } from "@/lib/format/dates";
import { OPEN_STAGES } from "@/lib/leads/stage-machine";
import { STAGE_COLOR_VAR, STAGE_LABEL, type Stage } from "@/lib/leads/stages";
import { cn } from "@/lib/utils";

export type PipelineLead = {
  id: string;
  full_name: string;
  phone: string;
  stage: Stage;
  source: string;
  agent_id: string | null;
  next_follow_up_at: string | null;
  last_activity_at: string | null;
  agent_assigned_at: string | null;
  invalid_confirmed_by: string | null;
  returned_to_lead: boolean;
};

type Filters = { view: string; closed: string; source: string; q: string; agent: string };
const CLOSED: Stage[] = ["not_interested", "invalid", "deposit_verified"];

/** No activity for `staleDays` (or never called that long after assignment). */
export function isStale(lead: PipelineLead, staleDays: number, now = new Date()) {
  if (!OPEN_STAGES.includes(lead.stage)) return false;
  const last = lead.last_activity_at ?? lead.agent_assigned_at;
  return !!last && now.getTime() - new Date(last).getTime() > staleDays * 86_400_000;
}

function LeadCard({ lead, staleDays, owner }: { lead: PipelineLead; staleDays: number; owner: string | null }) {
  const now = new Date();
  const due = lead.next_follow_up_at ? new Date(lead.next_follow_up_at) : null;
  const overdue = !!due && due < now && OPEN_STAGES.includes(lead.stage);
  const stale = isStale(lead, staleDays, now);
  return (
    <li>
      <Link
        href={`/lead/${lead.id}`}
        className={cn(
          "flex flex-col gap-1 rounded-control border bg-tl-surface px-3 py-2.5 shadow-card transition-colors hover:border-tl-line-strong",
          overdue ? "border-tl-danger/40" : "border-tl-line",
        )}
      >
        <span className="truncate text-body font-semibold text-tl-text">{lead.full_name}</span>
        <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-small">
          {due && OPEN_STAGES.includes(lead.stage) ? (
            <span className={overdue ? "font-semibold text-tl-danger" : "text-tl-muted"}>
              {overdue ? "Overdue" : describeWhen(due, now)}
            </span>
          ) : !lead.last_activity_at && OPEN_STAGES.includes(lead.stage) ? (
            <span className="text-tl-muted">Not called yet</span>
          ) : null}
          {stale ? <span className="font-semibold text-tl-text-2">Stale</span> : null}
          {lead.stage === "invalid" && !lead.invalid_confirmed_by ? <span className="font-semibold text-tl-wait">Waiting for confirmation</span> : null}
          {owner ? <span className="text-tl-muted">{owner}</span> : null}
          {!lead.agent_id && lead.returned_to_lead ? <span className="font-semibold text-tl-text-2">Returned</span> : null}
        </span>
      </Link>
    </li>
  );
}

export function PipelineScreen({
  leads,
  filters,
  canSeeTeam,
  staleDays,
  sources,
  people,
}: {
  leads: PipelineLead[];
  filters: Filters;
  canSeeTeam: boolean;
  staleDays: number;
  sources: string[];
  people: { id: string; full_name: string; role: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q);
  const names = new Map(people.map((p) => [p.id, p.full_name.split(" ")[0]]));

  function go(next: Partial<Filters>) {
    const merged = { ...filters, q, ...next };
    const params = new URLSearchParams(Object.entries(merged).filter(([k, v]) => v && !(k === "view" && v === "team")) as [string, string][]);
    if (!canSeeTeam) params.delete("view");
    router.replace(params.size ? `${pathname}?${params}` : pathname);
  }

  const columns: Stage[] = filters.closed ? [...OPEN_STAGES, ...CLOSED] : [...OPEN_STAGES];
  const byStage = new Map<Stage, PipelineLead[]>(columns.map((s) => [s, []]));
  for (const l of leads) byStage.get(l.stage)?.push(l);
  const staleCount = leads.filter((l) => isStale(l, staleDays)).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={filters.view === "team" ? "Team pipeline" : "My pipeline"}
        description={`${leads.length} ${leads.length === 1 ? "lead" : "leads"}${staleCount ? `, ${staleCount} stale (no activity for ${staleDays} days)` : ""}.`}
      />
      {canSeeTeam ? (
        <Tabs
          idPrefix="pipeline"
          label="Whose leads"
          value={filters.view as "team" | "mine"}
          onChange={(v) => go({ view: v, agent: "" })}
          items={[
            { value: "team", label: "Team" },
            { value: "mine", label: "Mine" },
          ]}
        />
      ) : null}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          go({});
        }}
      >
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Name
          <span className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tl-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="h-10 w-52 rounded-control border border-tl-line-strong bg-tl-surface pr-3 pl-9 text-body text-tl-text placeholder:text-tl-muted"
            />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Source
          <select
            value={filters.source}
            onChange={(e) => go({ source: e.target.value })}
            className="h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text"
          >
            <option value="">Any source</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {filters.view === "team" ? (
          <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
            With
            <select
              value={filters.agent}
              onChange={(e) => go({ agent: e.target.value })}
              className="h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text"
            >
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex h-10 items-center gap-2 text-label font-medium text-tl-text">
          <input
            type="checkbox"
            checked={filters.closed === "1"}
            onChange={(e) => go({ closed: e.target.checked ? "1" : "" })}
            className="size-4 accent-[var(--tl-primary)]"
          />
          Show closed
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {columns.map((s) => {
            const items = byStage.get(s) ?? [];
            return (
              <section
                key={s}
                aria-label={`${STAGE_LABEL[s]}, ${items.length}`}
                className="flex w-64 shrink-0 flex-col gap-2 rounded-card border border-tl-line bg-tl-bg p-2"
              >
                <header className="flex items-center justify-between gap-2 px-1.5 py-1">
                  <span className="flex items-center gap-2 text-label font-semibold text-tl-text">
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: `var(${STAGE_COLOR_VAR[s]})` }} />
                    {STAGE_LABEL[s]}
                  </span>
                  <span className="tl-amount rounded-full bg-tl-surface px-2 text-small font-semibold text-tl-muted">{items.length}</span>
                </header>
                {items.length > 0 ? (
                  <ul className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto">
                    {items.map((l) => (
                      <LeadCard key={l.id} lead={l} staleDays={staleDays} owner={filters.view === "team" && l.agent_id ? (names.get(l.agent_id) ?? null) : null} />
                    ))}
                  </ul>
                ) : (
                  <p className="px-1.5 py-4 text-center text-small text-tl-muted">None</p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
