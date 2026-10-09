"use client";

import Link from "next/link";
import { acceptReferral } from "@/app/(app)/sessions/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { describeWhen, karachiDayBounds, timeAgo } from "@/lib/format/dates";
import { formatPKR } from "@/lib/format/money";
import { useToastAction } from "@/lib/hooks/use-toast-action";
import { MODES, type Mode } from "@/lib/sessions/rules";
import { cn } from "@/lib/utils";

export type OpenReferral = {
  session_id: string;
  created_at: string;
  first_name: string;
  source: string;
  city: string | null;
  referral_note: string;
  preferred_at: string | null;
  mode: Mode;
  referred_by: string;
  for_me: boolean;
};

export type MySession = {
  id: string;
  lead_id: string;
  scheduled_at: string | null;
  preferred_at: string | null;
  mode: Mode;
  referral_note: string;
  created_at: string;
  lead: { full_name: string; source: string; city: string | null } | null;
};

export type AdminSession = {
  id: string;
  lead_id: string;
  created_at: string;
  scheduled_at: string | null;
  accepted_at: string | null;
  analyst_id: string | null;
  lead: { full_name: string } | null;
  analyst: { full_name: string } | null;
  /** No session date after the referral deadline (worked out on the server). */
  late: boolean;
};

const modeLabel = (m: Mode) => MODES.find((x) => x.value === m)?.label ?? m;

function Tile({ value, label, href }: { value: string | number; label: string; href?: string }) {
  const body = (
    <>
      <span className="tl-display tl-amount text-display-l text-tl-text">{value}</span>
      <span className="text-label text-tl-muted">{label}</span>
    </>
  );
  const cls = "flex flex-col gap-1 rounded-card border border-l-4 border-tl-line border-l-tl-primary bg-tl-surface p-4 shadow-card";
  return href ? (
    <a href={href} className={cn(cls, "hover:border-tl-line-strong")}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function AcceptForm({ sessionId, name }: { sessionId: string; name: string }) {
  const [, action, pending] = useToastAction(acceptReferral);
  return (
    <form action={action}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" size="sm" disabled={pending} aria-label={`Accept the referral for ${name}`}>
        Accept
      </Button>
    </form>
  );
}

function SessionLine({ s, highlight }: { s: MySession; highlight?: boolean }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card border bg-tl-surface px-4 py-3 shadow-card", highlight ? "border-tl-primary/40" : "border-tl-line")}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link href={`/lead/${s.lead_id}`} className="text-body font-semibold text-tl-text hover:text-tl-link hover:underline">
          {s.lead?.full_name ?? "Client"}
        </Link>
        <span className="flex flex-wrap gap-x-3 text-small text-tl-muted">
          <span>{s.scheduled_at ? describeWhen(new Date(s.scheduled_at)) : "No time booked"}</span>
          <span>{modeLabel(s.mode)}</span>
          {s.lead?.source ? <span>{s.lead.source}</span> : null}
        </span>
      </div>
      <Link
        href={`/lead/${s.lead_id}`}
        className="inline-flex h-8 items-center rounded-control border border-tl-line-strong bg-tl-surface px-3 text-label font-semibold text-tl-text hover:bg-tl-raised"
      >
        {s.scheduled_at ? "Open session" : "Book a time"}
      </Link>
    </li>
  );
}

export function SessionQueue({
  mode,
  firstName,
  referrals,
  mine,
  credit,
  all,
  deadlineHours,
}: {
  mode: "analyst" | "admin";
  firstName: string;
  referrals: OpenReferral[];
  mine: MySession[];
  credit: { clients: number; sessions: number; verifiedPkr: number; deposits: number };
  all: AdminSession[];
  deadlineHours: number;
}) {
  if (mode === "admin") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Session queue" description="Every open Technical Analysis referral, and who has it." />
        {all.length === 0 ? (
          <EmptyState title="No open referrals." body="When agents refer interested clients, they appear here until the analyst hands back." />
        ) : (
          <div className="overflow-x-auto rounded-card border border-tl-line bg-tl-surface shadow-card">
            <table className="w-full text-left">
              <caption className="sr-only">Open referrals</caption>
              <thead className="bg-tl-bg">
                <tr>
                  {["Client", "Analyst", "Status", "Waiting"].map((h) => (
                    <th key={h} scope="col" className="border-b border-tl-line px-4 py-2.5 text-label font-semibold text-tl-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {all.map((s) => (
                  <tr key={s.id} className="border-t border-tl-line first:border-t-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/lead/${s.lead_id}`} className="text-body font-semibold text-tl-text hover:text-tl-link hover:underline">
                        {s.lead?.full_name ?? "Client"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-body text-tl-text-2">{s.analyst?.full_name ?? "Any available"}</td>
                    <td className="px-4 py-2.5 text-body text-tl-text-2">
                      {s.scheduled_at ? `Booked ${describeWhen(new Date(s.scheduled_at))}` : s.accepted_at ? "Accepted, no time yet" : "Not accepted"}
                    </td>
                    <td className={cn("px-4 py-2.5 text-body", s.late ? "font-semibold text-tl-danger" : "text-tl-muted")}>
                      {timeAgo(s.created_at)}
                      {s.late ? ` (no session date after ${deadlineHours} h)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const { start, end } = karachiDayBounds();
  const today = mine.filter((s) => s.scheduled_at && new Date(s.scheduled_at) >= start && new Date(s.scheduled_at) < end);
  const upcoming = mine.filter((s) => s.scheduled_at && new Date(s.scheduled_at) >= end);
  const needsDate = mine.filter((s) => !s.scheduled_at);
  const past = mine.filter((s) => s.scheduled_at && new Date(s.scheduled_at) < start);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Session queue" description={`${firstName}, here are your referrals and sessions.`} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Tile value={referrals.length} label="New referrals" href="#new-referrals" />
        <Tile value={today.length} label="Sessions today" href="#today" />
        <Tile value={upcoming.length + needsDate.length} label="Upcoming or to book" href="#upcoming" />
        <Tile value={formatPKR(credit.verifiedPkr)} label={`My credit: verified deposits (${credit.clients} clients credited, ${credit.sessions} sessions held)`} />
      </div>

      <section id="new-referrals" aria-labelledby="new-referrals-title" className="flex scroll-mt-24 flex-col gap-3">
        <h2 id="new-referrals-title" className="text-title font-semibold text-tl-text">
          New referrals
        </h2>
        {referrals.length === 0 ? (
          <p className="text-body text-tl-muted">Nothing waiting. New referrals appear here and in your notifications.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {referrals.map((r) => (
              <li key={r.session_id} className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-card border border-tl-line bg-tl-surface px-4 py-3 shadow-card">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-body font-semibold text-tl-text">
                    {r.first_name}
                    <span className="rounded-full border border-tl-line px-2 text-small font-semibold text-tl-text-2">
                      {r.for_me ? "Sent to you" : "Any available"}
                    </span>
                  </span>
                  <p className="text-body text-tl-text-2">{r.referral_note}</p>
                  <span className="flex flex-wrap gap-x-3 text-small text-tl-muted">
                    <span>From {r.referred_by}</span>
                    <span>{r.preferred_at ? `Prefers ${describeWhen(new Date(r.preferred_at))}` : "Any time"}</span>
                    <span>{modeLabel(r.mode)}</span>
                    <span>{r.source}</span>
                    <span>{timeAgo(r.created_at)} ago</span>
                  </span>
                </div>
                <AcceptForm sessionId={r.session_id} name={r.first_name} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="today" aria-labelledby="today-title" className="flex scroll-mt-24 flex-col gap-3">
        <h2 id="today-title" className="text-title font-semibold text-tl-text">
          Today&apos;s sessions
        </h2>
        {today.length + past.length === 0 ? (
          <p className="text-body text-tl-muted">No sessions today.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...past, ...today].map((s) => (
              <SessionLine key={s.id} s={s} highlight />
            ))}
          </ul>
        )}
      </section>

      <section id="upcoming" aria-labelledby="upcoming-title" className="flex scroll-mt-24 flex-col gap-3">
        <h2 id="upcoming-title" className="text-title font-semibold text-tl-text">
          Upcoming
        </h2>
        {needsDate.length + upcoming.length === 0 ? (
          <p className="text-body text-tl-muted">Nothing booked ahead.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...needsDate, ...upcoming].map((s) => (
              <SessionLine key={s.id} s={s} />
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader
          className="mb-0"
          title="How credit works"
          description="When a client you saw attends, you are credited for them. Their verified deposits add to your total. Reversed deposits come off."
        />
      </Card>
    </div>
  );
}
