"use client";

import { Bookmark, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { sendToTeam } from "@/app/(app)/distribution/actions";
import { assignLeads } from "@/app/(app)/team/assign/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ContactChip, InterestChip } from "@/components/ui/contact-chip";
import { StageChip } from "@/components/ui/stage-chip";
import { useToast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/format/dates";
import { formatPhone } from "@/lib/format/phone";
import {
  CHANNEL_LABEL,
  CONTACT_CHANNELS,
  FRESHNESS,
  FRESHNESS_LABEL,
  TEMPERATURES,
  TEMPERATURE_LABEL,
  type ContactChannel,
  type Temperature,
} from "@/lib/leads/contact";
import { STAGE_LABEL, STAGES, type Stage } from "@/lib/leads/stages";
import { teamColorVar, type TeamColor } from "@/lib/teams";
import { PickTable, type PickColumn } from "./pick-table";

export type LeadListRow = {
  id: string;
  full_name: string;
  phone: string;
  source: string;
  stage: Stage;
  returned_to_lead: boolean;
  created_at: string;
  last_activity_at: string | null;
  temperature: Temperature | null;
  last_contacted_at: string | null;
  last_contact_channel: ContactChannel | null;
  team_id: string | null;
  agent_id: string | null;
  team: { name: string; color: TeamColor } | null;
  agent: { full_name: string } | null;
};

type Filters = {
  stage: string;
  team: string;
  agent: string;
  source: string;
  q: string;
  returned: string;
  interest: string;
  channel: string;
  contact: string;
};
type SavedView = { name: string; query: string };

const VIEWS_KEY = "tl.allLeads.views";
const BUILT_IN: SavedView[] = [
  { name: "In the pool", query: "team=pool" },
  { name: "Returned to Team Leads", query: "returned=1" },
  { name: "Hot leads", query: "interest=hot" },
  { name: "Not contacted for 8+ days", query: "contact=red" },
  { name: "Waiting for verification", query: "stage=deposit_recorded" },
  { name: "Verified clients", query: "stage=deposit_verified" },
];

// Saved views live in this browser only (a per-person convenience), read through a tiny external store.
const viewListeners = new Set<() => void>();

function rawViews(): string {
  try {
    return window.localStorage.getItem(VIEWS_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribeViews(onChange: () => void) {
  viewListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    viewListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function parseViews(raw: string): SavedView[] {
  try {
    const parsed = JSON.parse(raw) as SavedView[];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v?.name === "string" && typeof v?.query === "string") : [];
  } catch {
    return [];
  }
}

function writeViews(views: SavedView[]) {
  try {
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    // Private windows may block storage; saved views are a convenience only.
  }
  for (const l of viewListeners) l();
}

const selectClass = "h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text";

export function AllLeadsScreen({
  rows,
  total,
  page,
  pageSize,
  filters,
  teams,
  people,
  sources,
}: {
  rows: LeadListRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: Filters;
  teams: { id: string; name: string; color: TeamColor }[];
  people: { id: string; full_name: string; role: string; team_id: string }[];
  sources: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [q, setQ] = useState(filters.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const raw = useSyncExternalStore(subscribeViews, rawViews, () => "[]");
  const views = useMemo(() => parseViews(raw), [raw]);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const [moveTeam, setMoveTeam] = useState(teams[0]?.id ?? "");
  const [person, setPerson] = useState(people[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const current = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  ).toString();

  function go(next: Partial<Filters> & { page?: number }) {
    const merged: Record<string, string> = { ...filters, q, ...Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v ?? "")])) };
    if (!("page" in next)) delete merged.page;
    const params = new URLSearchParams(
      Object.entries(merged).filter(([k, v]) => v && !(k === "page" && v === "1")) as [string, string][],
    );
    router.replace(params.size ? `${pathname}?${params}` : pathname);
  }

  function saveView() {
    const name = viewName.trim().slice(0, 40);
    if (!name) return;
    writeViews([...views.filter((v) => v.name !== name), { name, query: current }]);
    setNaming(false);
    setViewName("");
    toast(`View "${name}" saved on this computer.`, "success");
  }

  function removeView(name: string) {
    writeViews(views.filter((v) => v.name !== name));
  }

  const ids = [...selected];
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  function move() {
    start(async () => {
      const r = await sendToTeam(ids, moveTeam, reason);
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) {
        setSelected(new Set());
        setReason("");
      }
    });
  }

  function assign() {
    start(async () => {
      const r = await assignLeads(ids, person, reason);
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) {
        setSelected(new Set());
        setReason("");
      }
    });
  }

  const columns: PickColumn<LeadListRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => (
        <a href={`/lead/${r.id}`} className="font-semibold text-tl-text hover:text-tl-link hover:underline">
          {r.full_name}
        </a>
      ),
    },
    { key: "phone", header: "Phone", cell: (r) => <span className="tl-amount">{formatPhone(r.phone)}</span> },
    { key: "stage", header: "Stage", cell: (r) => <StageChip stage={r.stage} /> },
    { key: "interest", header: "Interest", cell: (r) => <InterestChip temperature={r.temperature} /> },
    {
      key: "team",
      header: "Team",
      cell: (r) =>
        r.team ? (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: teamColorVar(r.team.color) }} />
            {r.team.name}
          </span>
        ) : (
          <span className="text-tl-muted">Pool</span>
        ),
    },
    {
      key: "agent",
      header: "With",
      cell: (r) =>
        r.agent ? (
          r.agent.full_name
        ) : r.returned_to_lead ? (
          <span className="font-semibold text-tl-text-2">Returned</span>
        ) : (
          <span className="text-tl-muted">Nobody yet</span>
        ),
    },
    { key: "source", header: "Source", cell: (r) => r.source },
    {
      key: "contact",
      header: "Last contact",
      cell: (r) => <ContactChip lastContactedAt={r.last_contacted_at} channel={r.last_contact_channel} />,
    },
    {
      key: "activity",
      header: "Last activity",
      align: "right",
      cell: (r) => <span className="text-tl-muted">{timeAgo(r.last_activity_at ?? r.created_at)}</span>,
    },
  ];

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="All leads" description="Every lead in the company. Filter, save a view, and move or reassign in bulk." />

      <div className="flex flex-wrap items-center gap-2" aria-label="Saved views">
        <Bookmark aria-hidden className="size-4 text-tl-muted" />
        {[...BUILT_IN, ...views].map((v) => (
          <span key={v.name} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => router.replace(v.query ? `${pathname}?${v.query}` : pathname)}
              className={`rounded-full border px-3 py-1 text-label font-semibold ${
                v.query === current ? "border-tl-primary bg-tl-primary-soft text-tl-primary" : "border-tl-line bg-tl-surface text-tl-text-2 hover:border-tl-line-strong"
              }`}
            >
              {v.name}
            </button>
            {!BUILT_IN.includes(v) ? (
              <button
                type="button"
                aria-label={`Remove the view ${v.name}`}
                onClick={() => removeView(v.name)}
                className="-ml-1 inline-flex size-6 items-center justify-center rounded-full text-tl-muted hover:text-tl-text"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </span>
        ))}
        {current && !naming ? (
          <button type="button" onClick={() => setNaming(true)} className="text-label font-semibold text-tl-link hover:underline">
            Save this view
          </button>
        ) : null}
        {naming ? (
          <span className="inline-flex items-center gap-2">
            <input
              autoFocus
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveView();
                if (e.key === "Escape") setNaming(false);
              }}
              aria-label="Name for this view"
              placeholder="Name this view"
              maxLength={40}
              className="h-8 w-44 rounded-control border border-tl-line-strong bg-tl-surface px-2.5 text-label text-tl-text"
            />
            <Button size="sm" onClick={saveView} disabled={!viewName.trim()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>
              Cancel
            </Button>
          </span>
        ) : null}
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          go({});
        }}
      >
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Search
          <span className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tl-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or phone"
              className="h-10 w-56 rounded-control border border-tl-line-strong bg-tl-surface pr-3 pl-9 text-body text-tl-text placeholder:text-tl-muted"
            />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Stage
          <select value={filters.stage} onChange={(e) => go({ stage: e.target.value })} className={selectClass}>
            <option value="">Any stage</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Team
          <select value={filters.team} onChange={(e) => go({ team: e.target.value, agent: "" })} className={selectClass}>
            <option value="">Any team</option>
            <option value="pool">In the pool</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          With
          <select value={filters.agent} onChange={(e) => go({ agent: e.target.value })} className={selectClass}>
            <option value="">Anyone</option>
            {people
              .filter((p) => !filters.team || filters.team === "pool" || p.team_id === filters.team)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Source
          <select value={filters.source} onChange={(e) => go({ source: e.target.value })} className={selectClass}>
            <option value="">Any source</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Interest
          <select value={filters.interest} onChange={(e) => go({ interest: e.target.value })} className={selectClass}>
            <option value="">Any interest</option>
            {TEMPERATURES.map((t) => (
              <option key={t} value={t}>
                {TEMPERATURE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Contacted by
          <select value={filters.channel} onChange={(e) => go({ channel: e.target.value })} className={selectClass}>
            <option value="">Any way</option>
            {CONTACT_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Last contact
          <select value={filters.contact} onChange={(e) => go({ contact: e.target.value })} className={selectClass}>
            <option value="">Any time</option>
            {FRESHNESS.map((f) => (
              <option key={f} value={f}>
                {FRESHNESS_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-10 items-center gap-2 text-label font-medium text-tl-text">
          <input
            type="checkbox"
            checked={filters.returned === "1"}
            onChange={(e) => go({ returned: e.target.checked ? "1" : "" })}
            className="size-4 accent-[var(--tl-primary)]"
          />
          Returned only
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {current ? (
          <Button variant="ghost" onClick={() => router.replace(pathname)}>
            Clear filters
          </Button>
        ) : null}
      </form>

      {selected.size > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="flex flex-wrap items-end gap-3 rounded-card border border-tl-primary/40 bg-tl-primary-soft/60 p-4"
        >
          <p className="w-full text-body font-semibold text-tl-text">
            {selected.size} {selected.size === 1 ? "lead" : "leads"} ticked
          </p>
          <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
            Reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="Needed to move or reassign"
              className="h-10 w-64 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text placeholder:text-tl-muted"
            />
          </label>
          <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
            Team
            <select value={moveTeam} onChange={(e) => setMoveTeam(e.target.value)} className={selectClass}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={move} disabled={pending}>
            Move to team
          </Button>
          <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
            Person
            <select value={person} onChange={(e) => setPerson(e.target.value)} className={selectClass}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({teamName.get(p.team_id) ?? "No team"})
                </option>
              ))}
            </select>
          </label>
          <Button onClick={assign} disabled={pending}>
            Assign to person
          </Button>
        </div>
      ) : null}

      <p className="text-label text-tl-muted">
        {total.toLocaleString("en-US")} {total === 1 ? "lead" : "leads"}
      </p>
      <PickTable
        rows={rows}
        columns={columns}
        selected={selected}
        onChange={setSelected}
        caption="Leads"
        rowLabel={(r) => r.full_name}
        empty={<EmptyState title="No leads match." body="Clear the filters to see every lead." />}
      />
      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => go({ page: page - 1 })}>
            <ChevronLeft aria-hidden className="size-4" />
            Previous
          </Button>
          <span className="tl-amount text-label text-tl-muted">
            Page {page} of {pages}
          </span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => go({ page: page + 1 })}>
            Next
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
