"use client";

import { Search, Shuffle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  confirmDistribution,
  previewDistribution,
  sendToTeam,
  type DistributionPreview,
} from "@/app/(app)/distribution/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/format/dates";
import { formatPhone } from "@/lib/format/phone";
import { teamColorVar, type TeamColor } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { PickTable, type PickColumn } from "./pick-table";

export type PoolRow = {
  id: string;
  full_name: string;
  phone: string;
  source: string;
  campaign: string | null;
  city: string | null;
  created_at: string;
};

export type TeamCard = {
  id: string;
  name: string;
  color: TeamColor;
  lead: string;
  agents: number;
  open: number;
  unassigned: number;
};

const SHOWN = 300;

const columns: PickColumn<PoolRow>[] = [
  { key: "name", header: "Name", cell: (r) => <span className="font-semibold text-tl-text">{r.full_name}</span> },
  { key: "phone", header: "Phone", cell: (r) => <span className="tl-amount">{formatPhone(r.phone)}</span> },
  { key: "source", header: "Source", cell: (r) => r.source },
  { key: "campaign", header: "Campaign", cell: (r) => r.campaign ?? <span className="text-tl-muted">None</span> },
  { key: "city", header: "City", cell: (r) => r.city ?? <span className="text-tl-muted">None</span> },
  { key: "age", header: "In pool", align: "right", cell: (r) => <span className="text-tl-muted">{timeAgo(r.created_at)}</span> },
];

function Filters({ filters, sources }: { filters: { source: string; campaign: string; q: string }; sources: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q);
  const [campaign, setCampaign] = useState(filters.campaign);

  function apply(next: Partial<typeof filters>) {
    const merged = { ...filters, q, campaign, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.replace(params.size ? `${pathname}?${params}` : pathname);
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply({});
      }}
    >
      <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
        Source
        <select
          value={filters.source}
          onChange={(e) => apply({ source: e.target.value })}
          className="h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text"
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
        Campaign
        <input
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          placeholder="Any campaign"
          className="h-10 w-48 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text placeholder:text-tl-muted"
        />
      </label>
      <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
        Name
        <span className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tl-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the pool"
            className="h-10 w-56 rounded-control border border-tl-line-strong bg-tl-surface pr-3 pl-9 text-body text-tl-text placeholder:text-tl-muted"
          />
        </span>
      </label>
      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
  );
}

export function DistributionScreen({
  rows,
  matching,
  poolTotal,
  bySource,
  teams,
  filters,
}: {
  rows: PoolRow[];
  matching: number;
  poolTotal: number;
  bySource: Record<string, number>;
  teams: TeamCard[];
  filters: { source: string; campaign: string; q: string };
}) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosenTeams, setChosenTeams] = useState<Set<string>>(new Set(teams.map((t) => t.id)));
  const [target, setTarget] = useState(teams[0]?.id ?? "");
  const [preview, setPreview] = useState<Extract<DistributionPreview, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const sources = Object.keys(bySource).sort((a, b) => bySource[b] - bySource[a]);

  const ids = [...selected];

  function toggleTeam(id: string) {
    setChosenTeams((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function previewEven() {
    start(async () => {
      const r = await previewDistribution(ids, [...chosenTeams]);
      if (!r.ok) return toast(r.message, "error");
      setPreview(r);
    });
  }

  function confirmEven() {
    start(async () => {
      const r = await confirmDistribution(ids, [...chosenTeams]);
      setPreview(null);
      if (!r.ok) return toast(r.message, "error");
      setSelected(new Set());
      toast(`${r.moved} ${r.moved === 1 ? "lead" : "leads"} sent to ${chosenTeams.size} ${chosenTeams.size === 1 ? "team" : "teams"}. ${chosenTeams.size === 1 ? "Its Team Lead has" : "Each Team Lead has"} been told.`, "success");
    });
  }

  function sendAll() {
    start(async () => {
      const r = await sendToTeam(ids, target);
      if (!r.ok) return toast(r.message, "error");
      setSelected(new Set());
      toast(r.message, "success");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lead distribution"
        description="Send new leads from the pool to teams. Team Leads then assign them to agents."
      />

      <ul className="flex flex-wrap gap-2" aria-label="Pool by source">
        <li>
          <button
            type="button"
            onClick={() => router.replace(pathname)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-label font-semibold",
              !filters.source ? "border-tl-primary bg-tl-primary-soft text-tl-primary" : "border-tl-line bg-tl-surface text-tl-text-2",
            )}
          >
            In the pool <span className="tl-amount">{poolTotal}</span>
          </button>
        </li>
        {sources.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => router.replace(`${pathname}?source=${encodeURIComponent(s)}`)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-label font-semibold",
                filters.source === s ? "border-tl-primary bg-tl-primary-soft text-tl-primary" : "border-tl-line bg-tl-surface text-tl-text-2",
              )}
            >
              {s} <span className="tl-amount">{bySource[s]}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Filters filters={filters} sources={sources} />
          <div className="flex flex-wrap items-center gap-3 text-label text-tl-muted">
            <span>
              {matching.toLocaleString("en-US")} {matching === 1 ? "lead matches" : "leads match"}
              {matching > rows.length ? `, ${rows.length.toLocaleString("en-US")} loaded` : ""}
            </span>
            {rows.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelected(new Set(rows.map((r) => r.id)))}
                className="font-semibold text-tl-link hover:underline"
              >
                {rows.length === matching
                  ? `Tick all ${rows.length.toLocaleString("en-US")} matching`
                  : `Tick the oldest ${rows.length.toLocaleString("en-US")}`}
              </button>
            ) : null}
            {selected.size > 0 ? (
              <button type="button" onClick={() => setSelected(new Set())} className="font-semibold text-tl-link hover:underline">
                Clear
              </button>
            ) : null}
          </div>
          <PickTable
            rows={rows.slice(0, SHOWN)}
            columns={columns}
            selected={selected}
            onChange={setSelected}
            caption="Leads in the pool"
            rowLabel={(r) => r.full_name}
            empty={
              <EmptyState
                title={poolTotal === 0 ? "The pool is empty." : "No pool leads match."}
                body={poolTotal === 0 ? "New leads appear here once they are added or imported." : "Clear the filters to see the whole pool."}
              />
            }
          />
          {rows.length > SHOWN ? (
            <p className="text-small text-tl-muted">
              Showing the oldest {SHOWN}. Ticking above includes all {rows.length.toLocaleString("en-US")} loaded.
            </p>
          ) : null}
        </div>

        <aside className="sticky top-20 flex flex-col gap-4 rounded-card border border-tl-line bg-tl-surface p-5 shadow-card">
          <div className="flex items-baseline justify-between">
            <h2 className="text-title font-semibold text-tl-text">Teams</h2>
            <span className="text-label text-tl-muted">
              <span className="tl-amount font-semibold text-tl-text">{selected.size}</span> ticked
            </span>
          </div>
          <div className="flex gap-3 text-small">
            <button type="button" className="font-semibold text-tl-link hover:underline" onClick={() => setChosenTeams(new Set(teams.map((t) => t.id)))}>
              All teams
            </button>
            <button type="button" className="font-semibold text-tl-link hover:underline" onClick={() => setChosenTeams(new Set())}>
              None
            </button>
          </div>
          <ul className="flex max-h-[360px] flex-col gap-1 overflow-y-auto" aria-label="Teams to share between">
            {teams.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-2 hover:bg-tl-bg">
                  <input
                    type="checkbox"
                    checked={chosenTeams.has(t.id)}
                    onChange={() => toggleTeam(t.id)}
                    aria-label={`Share with ${t.name}`}
                    className="size-4 accent-[var(--tl-primary)]"
                  />
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: teamColorVar(t.color) }} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold text-tl-text">{t.name}</span>
                    <span className="text-small text-tl-muted">
                      {t.agents} {t.agents === 1 ? "agent" : "agents"}, {t.open} open, {t.unassigned} waiting
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button onClick={previewEven} disabled={pending || selected.size === 0 || chosenTeams.size === 0}>
            <Shuffle aria-hidden className="size-4" />
            Distribute evenly
          </Button>
          <div className="flex flex-col gap-2 border-t border-tl-line pt-4">
            <label htmlFor="send-team" className="text-label font-medium text-tl-text">
              Or send all ticked leads to one team
            </label>
            <select
              id="send-team"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={sendAll} disabled={pending || selected.size === 0 || !target}>
              Assign to team
            </Button>
          </div>
        </aside>
      </div>

      <Sheet
        open={preview !== null}
        onClose={() => setPreview(null)}
        title="Check the split"
        description={preview ? `${preview.leadCount} leads across ${preview.rows.length} teams. Nothing is sent until you confirm.` : undefined}
        className="max-w-none"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button onClick={confirmEven} disabled={pending}>
              {pending ? "Sending" : `Send ${preview?.leadCount ?? 0} leads`}
            </Button>
          </>
        }
      >
        {preview ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Leads each team will get, by source</caption>
              <thead>
                <tr className="border-b border-tl-line">
                  <th scope="col" className="py-2 pr-3 text-label font-semibold text-tl-muted">
                    Team
                  </th>
                  {preview.sources.map((s) => (
                    <th key={s} scope="col" className="px-2 py-2 text-right text-label font-semibold text-tl-muted">
                      {s}
                    </th>
                  ))}
                  <th scope="col" className="py-2 pl-2 text-right text-label font-semibold text-tl-text">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.teamId} className="border-b border-tl-line last:border-b-0">
                    <th scope="row" className="py-2 pr-3 text-body font-semibold text-tl-text">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: teamColorVar(r.color as TeamColor) }} />
                        {r.name}
                      </span>
                    </th>
                    {preview.sources.map((s) => (
                      <td key={s} className="tl-amount px-2 py-2 text-right text-body text-tl-text-2">
                        {r.bySource[s]}
                      </td>
                    ))}
                    <td className="tl-amount py-2 pl-2 text-right text-body font-semibold text-tl-text">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
