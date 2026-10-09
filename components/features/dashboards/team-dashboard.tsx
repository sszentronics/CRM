import { Flame, Gift } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/features/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { CountTile } from "@/components/ui/count-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { SlantBar } from "@/components/ui/slant-bar";
import { StageChip } from "@/components/ui/stage-chip";
import { showStreak } from "@/lib/boards/periods";
import { formatPKR } from "@/lib/format/money";
import { timeAgo } from "@/lib/format/dates";
import { STAGE_LABEL, STAGES, type Stage } from "@/lib/leads/stages";
import { teamColorVar, type TeamColor } from "@/lib/teams";

export type TeamAgent = { id: string; name: string; photo: string | null; open_leads: number; calls_today: number; overdue: number; total: number; streak: number };

export type TeamOverview = {
  team_id: string;
  calls_today: number;
  overdue: number;
  unassigned: number;
  returned: number;
  new_funded: number;
  pending_deposits: number;
  stages: Record<string, number>;
  agents: TeamAgent[];
};

export type TeamBanner = { name: string; color: TeamColor; rank: number; teams: number; total: number; target: number | null; prize: string | null };
export type PoolLead = { id: string; full_name: string; stage: Stage; source: string; last_activity_at: string | null; created_at: string };

const PIPELINE_STAGES = STAGES.filter((s) => !["new", "not_interested", "invalid"].includes(s));

function LeadList({ title, empty, leads }: { title: string; empty: string; leads: PoolLead[] }) {
  return (
    <Card>
      <CardHeader title={title} className="mb-3" />
      {leads.length === 0 ? (
        <p className="text-body text-tl-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-tl-line">
          {leads.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2">
              <Link href={`/lead/${l.id}`} className="min-w-0 flex-1 truncate text-body font-semibold text-tl-text hover:text-tl-link hover:underline">
                {l.full_name}
              </Link>
              <StageChip stage={l.stage} />
              <span className="shrink-0 text-small text-tl-muted">{timeAgo(l.last_activity_at ?? l.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The Team Lead's home: where the team stands, who needs help, and what is waiting to be handed out. */
export function TeamDashboard({
  banner,
  overview,
  unassigned,
  returned,
}: {
  banner: TeamBanner;
  overview: TeamOverview;
  unassigned: PoolLead[];
  returned: PoolLead[];
}) {
  const pct = banner.target ? Math.round((banner.total / banner.target) * 100) : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Team dashboard" description={`${banner.name}, this month. Money counts verified deposits only.`} />

      <Card aria-label="Team standing" className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-label font-semibold text-tl-muted">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: teamColorVar(banner.color) }} />
              Rank {banner.rank} of {banner.teams} teams
            </p>
            <MoneyText amount={banner.total} verified className="text-display-l" />
            <p className="text-body text-tl-muted">
              {banner.target ? `${pct}% of the ${formatPKR(banner.target)} target` : "No target set for this month"}
            </p>
          </div>
          {banner.prize ? (
            <p className="flex items-center gap-2 rounded-control bg-tl-primary-soft px-3 py-2 text-body font-semibold text-tl-primary">
              <Gift aria-hidden className="size-4" />
              Prize for reaching the target: {banner.prize}
            </p>
          ) : null}
        </div>
        {banner.target ? (
          <SlantBar value={banner.total} target={banner.target} color={teamColorVar(banner.color)} label={`${banner.name} progress toward target`} />
        ) : null}
      </Card>

      <section aria-label="Team tiles" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <CountTile count={overview.new_funded} label="New funded clients" href="/leaderboard?board=my_team" />
        <CountTile count={overview.calls_today} label="Calls today" href="/pipeline" />
        <CountTile
          count={overview.overdue}
          label="Overdue follow-ups"
          href="/pipeline"
          tone={overview.overdue > 0 ? "danger" : "default"}
          note={overview.overdue > 0 ? "Needs a call" : undefined}
        />
        <CountTile
          count={overview.unassigned}
          label="Waiting for an agent"
          href="/team/assign"
          tone={overview.unassigned > 0 ? "wait" : "default"}
          note={overview.unassigned > 0 ? "Hand them out" : undefined}
        />
      </section>

      <Card className="p-0">
        <CardHeader title="Agents" description="Verified totals this month, with today's activity." className="px-5 pt-5" />
        {overview.agents.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No agents on this team yet." body="The Admin adds agents to a team." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Agents on the team</caption>
              <thead className="bg-tl-bg">
                <tr>
                  {["Agent", "Open leads", "Calls today", "Overdue", "Verified this month"].map((h, i) => (
                    <th key={h} scope="col" className={`border-y border-tl-line px-5 py-2.5 text-label font-semibold text-tl-muted ${i === 4 ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.agents.map((a) => (
                  <tr key={a.id} className="border-t border-tl-line first:border-t-0">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar name={a.name} src={a.photo} size={28} team={banner.color} />
                        <span className="text-body font-semibold text-tl-text">{a.name}</span>
                        {showStreak(a.streak) ? (
                          <span className="inline-flex items-center gap-0.5 text-small font-semibold text-tl-primary" aria-label={`${a.streak} day streak`}>
                            <Flame aria-hidden className="size-4" />
                            {a.streak}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="tl-amount px-5 py-3 text-body text-tl-text-2">{a.open_leads}</td>
                    <td className="tl-amount px-5 py-3 text-body text-tl-text-2">{a.calls_today}</td>
                    <td className={`tl-amount px-5 py-3 text-body ${a.overdue > 0 ? "font-semibold text-tl-danger" : "text-tl-text-2"}`}>{a.overdue}</td>
                    <td className="px-5 py-3 text-right">
                      <MoneyText amount={a.total} verified={a.total > 0} className="text-body font-semibold" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Where the team's leads are" className="mb-3" />
        <ol aria-label="Stage strip" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {PIPELINE_STAGES.map((s) => (
            <li key={s}>
              <Link href="/pipeline" className="flex flex-col gap-1 rounded-control border border-tl-line p-3 hover:border-tl-line-strong">
                <span className="tl-display tl-amount text-display-m text-tl-text">{overview.stages[s] ?? 0}</span>
                <span className="text-small text-tl-muted">{STAGE_LABEL[s]}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <LeadList title={`Waiting for an agent (${overview.unassigned})`} empty="Every lead has an agent." leads={unassigned} />
        <LeadList title={`Returned to you (${overview.returned})`} empty="Nothing has come back." leads={returned} />
      </div>
    </div>
  );
}
