import Link from "next/link";
import { PageHeader } from "@/components/features/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { CountTile } from "@/components/ui/count-tile";
import { MoneyText } from "@/components/ui/money-text";
import { ageNote, ageTone } from "@/lib/dashboards/age";

type Tile = { count: number; oldest: string | null };

export type WorkQueueData = {
  deposits: Tile;
  documents: Tile;
  pool: Tile;
  alerts: { cash_flagged: number; referrals_overdue: number; invalid_waiting: number; returned_unassigned: number; first_calls_late: number };
  today: { verified_count: number; verified_pkr: number; documents_reviewed: number; leads_added: number };
};

const ALERTS: { key: keyof WorkQueueData["alerts"]; text: (n: number) => string; href: string }[] = [
  { key: "cash_flagged", text: (n) => `${n} cash ${n === 1 ? "deposit" : "deposits"} above the limit waiting for a check`, href: "/deposits" },
  { key: "referrals_overdue", text: (n) => `${n} ${n === 1 ? "referral has" : "referrals have"} no session date`, href: "/sessions" },
  { key: "invalid_waiting", text: (n) => `${n} Invalid ${n === 1 ? "mark is" : "marks are"} waiting for a Team Lead`, href: "/leads?stage=invalid" },
  { key: "returned_unassigned", text: (n) => `${n} returned ${n === 1 ? "lead is" : "leads are"} still without an agent`, href: "/leads" },
  { key: "first_calls_late", text: (n) => `${n} new ${n === 1 ? "lead has" : "leads have"} had no first call in time`, href: "/leads?stage=assigned" },
];

/** The Admin's home: three queues with how long the oldest item has waited, then what needs a look. */
export function WorkQueue({ data, firstName }: { data: WorkQueueData; firstName: string }) {
  const tile = (t: Tile) => ({ tone: ageTone(t.oldest, t.count), note: ageNote(t.oldest, t.count) });
  const active = ALERTS.filter((a) => data.alerts[a.key] > 0);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Work queue" description={`${firstName}, here is what is waiting for you. Tiles turn amber after 12 hours and red after 24.`} />

      <section aria-label="Queues" className="grid gap-4 md:grid-cols-3">
        <CountTile count={data.deposits.count} label="Deposits to verify" href="/deposits" {...tile(data.deposits)} />
        <CountTile count={data.documents.count} label="Documents to review" href="/documents" {...tile(data.documents)} />
        <CountTile count={data.pool.count} label="Leads waiting for a team" href="/distribution" {...tile(data.pool)} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Needs a look" className="mb-3" />
          {active.length === 0 ? (
            <p className="text-body text-tl-muted">Nothing needs a look right now.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-tl-line">
              {active.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-center gap-3 py-3 text-body font-semibold text-tl-text hover:text-tl-link">
                    <span aria-hidden className="size-2 rounded-full bg-tl-wait" />
                    {a.text(data.alerts[a.key])}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Today" className="mb-3" />
          <dl className="grid grid-cols-2 gap-4">
            <Link href="/deposits" className="flex flex-col">
              <dt className="text-label text-tl-muted">Verified today</dt>
              <dd>
                <MoneyText amount={data.today.verified_pkr} verified className="text-title" />
                <span className="block text-small text-tl-muted">
                  {data.today.verified_count} {data.today.verified_count === 1 ? "deposit" : "deposits"}
                </span>
              </dd>
            </Link>
            <Link href="/documents" className="flex flex-col">
              <dt className="text-label text-tl-muted">Documents reviewed</dt>
              <dd className="tl-display tl-amount text-title text-tl-text">{data.today.documents_reviewed}</dd>
            </Link>
            <Link href="/leads" className="flex flex-col">
              <dt className="text-label text-tl-muted">Leads added</dt>
              <dd className="tl-display tl-amount text-title text-tl-text">{data.today.leads_added}</dd>
            </Link>
          </dl>
        </Card>
      </div>
    </div>
  );
}
