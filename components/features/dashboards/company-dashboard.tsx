import Link from "next/link";
import { PageHeader } from "@/components/features/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { CountTile } from "@/components/ui/count-tile";
import { MoneyText } from "@/components/ui/money-text";
import { RankBadge } from "@/components/ui/rank-badge";
import { PERIODS, type Period } from "@/lib/boards/periods";
import type { FeedRow, TeamRow } from "@/lib/boards/types";
import { timeAgo } from "@/lib/format/dates";
import { formatPKR } from "@/lib/format/money";
import { teamColorVar } from "@/lib/teams";
import { cn } from "@/lib/utils";

export type CompanyData = {
  headline: { verified_pkr: number; deposits: number; new_funded: number; leads_added: number; active_leads: number };
  funnel: { step: string; n: number }[];
  sources: { source: string; leads: number; verified_pkr: number; funded: number }[];
  brokers: { name: string; verified_pkr: number; deposits: number }[];
  attention: { deposits_late: number; documents_late: number; referrals_overdue: number; first_calls_late: number; pool: number };
};

const ATTENTION: { key: keyof CompanyData["attention"]; text: (n: number) => string; href: string }[] = [
  { key: "deposits_late", text: (n) => `${n} ${n === 1 ? "deposit has" : "deposits have"} waited more than 24 hours`, href: "/deposits" },
  { key: "documents_late", text: (n) => `${n} ${n === 1 ? "document has" : "documents have"} waited more than 2 days`, href: "/documents" },
  { key: "referrals_overdue", text: (n) => `${n} ${n === 1 ? "referral has" : "referrals have"} no session date`, href: "/sessions" },
  { key: "first_calls_late", text: (n) => `${n} new ${n === 1 ? "lead has" : "leads have"} had no first call in time`, href: "/leads?stage=assigned" },
  { key: "pool", text: (n) => `${n} ${n === 1 ? "lead is" : "leads are"} waiting for a team`, href: "/distribution" },
];

/** The owners' home: the headline, the team race, the funnel, and where the money comes from. */
export function CompanyDashboard({
  data,
  period,
  teams,
  feed,
}: {
  data: CompanyData;
  period: Period;
  teams: TeamRow[];
  feed: FeedRow[];
}) {
  const top = Math.max(...data.funnel.map((f) => f.n), 1);
  const attention = ATTENTION.filter((a) => data.attention[a.key] > 0);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Company dashboard"
        description="Verified deposits only. Every figure opens the list or board behind it."
        actions={
          <nav aria-label="Period" className="flex gap-1 rounded-control bg-tl-raised p-1">
            {PERIODS.map((p) => (
              <Link
                key={p.value}
                href={`/dashboard?period=${p.value}`}
                aria-current={period === p.value ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-[6px] px-3 text-label font-semibold",
                  period === p.value ? "bg-tl-surface text-tl-text shadow-card" : "text-tl-muted hover:text-tl-text",
                )}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        }
      />

      <section aria-label="Headline" className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Link href="/leaderboard" className="flex min-h-28 flex-col justify-between gap-3 rounded-card border border-l-4 border-tl-line border-l-tl-primary bg-tl-surface p-5 shadow-card xl:col-span-2">
          <MoneyText amount={data.headline.verified_pkr} verified className="text-display-l" />
          <span className="text-label font-medium text-tl-muted">Verified deposits</span>
        </Link>
        <CountTile count={data.headline.deposits} label="Verified deposits (number)" href="/deposits" />
        <CountTile count={data.headline.new_funded} label="New funded clients" href="/leads?stage=deposit_verified" />
        <CountTile count={data.headline.leads_added} label="Leads added" href="/leads" />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Team ranking" className="mb-3" />
          {teams.length === 0 ? (
            <p className="text-body text-tl-muted">No teams yet.</p>
          ) : (
            <ol aria-label="Team ranking" className="flex flex-col divide-y divide-tl-line">
              {teams.map((t) => (
                <li key={t.teamId}>
                  <Link href="/arena" className="flex items-center gap-3 py-2.5 hover:bg-tl-bg">
                    <RankBadge rank={t.rank} size={32} />
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: teamColorVar(t.color) }} />
                    <span className="min-w-0 flex-1 truncate text-body font-semibold text-tl-text">{t.name}</span>
                    <MoneyText amount={t.total} verified={t.total > 0} className="text-body font-semibold" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <CardHeader title="Funnel" description="Leads that moved into each step in this period." className="mb-3" />
          <ol aria-label="Funnel" className="flex flex-col gap-2">
            {data.funnel.map((f) => (
              <li key={f.step} className="grid grid-cols-[170px_1fr_auto] items-center gap-3">
                <span className="text-label text-tl-text-2">{f.step}</span>
                <span className="h-5 rounded-control bg-tl-raised">
                  <span className="block h-full rounded-control bg-tl-primary" style={{ width: `${Math.max((f.n / top) * 100, f.n > 0 ? 2 : 0)}%` }} />
                </span>
                <span className="tl-amount w-10 text-right text-label font-semibold text-tl-text">{f.n}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-0">
          <CardHeader title="Where the money comes from" description="By lead source." className="px-5 pt-5" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <caption className="sr-only">Leads and verified deposits by source</caption>
              <thead className="bg-tl-bg">
                <tr>
                  {["Source", "Leads", "Funded", "Verified"].map((h, i) => (
                    <th key={h} scope="col" className={cn("border-y border-tl-line px-5 py-2.5 text-label font-semibold text-tl-muted", i > 0 && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s.source} className="border-t border-tl-line first:border-t-0">
                    <td className="px-5 py-2.5 text-body font-semibold text-tl-text">{s.source}</td>
                    <td className="tl-amount px-5 py-2.5 text-right text-body text-tl-text-2">{s.leads}</td>
                    <td className="tl-amount px-5 py-2.5 text-right text-body text-tl-text-2">{s.funded}</td>
                    <td className="px-5 py-2.5 text-right">
                      <MoneyText amount={Number(s.verified_pkr)} verified={Number(s.verified_pkr) > 0} className="text-body font-semibold" />
                    </td>
                  </tr>
                ))}
                {data.sources.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-body text-tl-muted">No leads yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-0">
          <CardHeader title="By broker" className="px-5 pt-5" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-left">
              <caption className="sr-only">Verified deposits by broker</caption>
              <thead className="bg-tl-bg">
                <tr>
                  {["Broker", "Deposits", "Verified"].map((h, i) => (
                    <th key={h} scope="col" className={cn("border-y border-tl-line px-5 py-2.5 text-label font-semibold text-tl-muted", i > 0 && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.brokers.map((b) => (
                  <tr key={b.name} className="border-t border-tl-line first:border-t-0">
                    <td className="px-5 py-2.5 text-body font-semibold text-tl-text">{b.name}</td>
                    <td className="tl-amount px-5 py-2.5 text-right text-body text-tl-text-2">{b.deposits}</td>
                    <td className="px-5 py-2.5 text-right">
                      <MoneyText amount={Number(b.verified_pkr)} verified={Number(b.verified_pkr) > 0} className="text-body font-semibold" />
                    </td>
                  </tr>
                ))}
                {data.brokers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-4 text-body text-tl-muted">No brokers yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Live" description="The newest verified deposits." className="mb-3" />
          {feed.length === 0 ? (
            <p className="text-body text-tl-muted">New month, clean board. The first verified deposit takes the lead.</p>
          ) : (
            <ol aria-label="Live deposits" className="flex flex-col divide-y divide-tl-line">
              {feed.slice(0, 8).map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2 text-label">
                  <span className="w-28 truncate font-semibold text-tl-text">{f.teamName}</span>
                  <span className="tl-display tl-amount font-semibold text-tl-win">+ {formatPKR(f.amount)}</span>
                  <span className="min-w-0 flex-1 truncate text-tl-text-2">{f.agentName}</span>
                  <span className="shrink-0 text-small text-tl-muted">{timeAgo(f.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <CardHeader title="Needs attention" className="mb-3" />
          {attention.length === 0 ? (
            <p className="text-body text-tl-muted">Nothing needs attention.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-tl-line">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-center gap-3 py-3 text-body font-semibold text-tl-text hover:text-tl-link">
                    <span aria-hidden className="size-2 rounded-full bg-tl-wait" />
                    {a.text(data.attention[a.key])}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
