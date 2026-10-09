"use client";

import { Flame } from "lucide-react";
import { useState, useTransition } from "react";
import { refreshBoard } from "@/app/(app)/leaderboard/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { RankBadge } from "@/components/ui/rank-badge";
import { Tabs } from "@/components/ui/tabs";
import { BOARD_LABEL, type BoardKind, type BoardRow } from "@/lib/boards/kinds";
import { PERIODS, rankMovement, showStreak, type Period } from "@/lib/boards/periods";
import { teamColorVar } from "@/lib/teams";
import { cn } from "@/lib/utils";

type Loaded = { rows: BoardRow[]; me: BoardRow | null };

function Person({ row, size = 40 }: { row: BoardRow; size?: 28 | 40 | 64 }) {
  return <Avatar name={row.name} src={row.photo} size={size} team={row.color ?? undefined} />;
}

/** Boards for the sales floor: top three cards, the full ranked list, and the viewer's own row pinned below. */
export function LeaderboardScreen({
  boards,
  initialBoard,
  initial,
  viewerId,
}: {
  boards: BoardKind[];
  initialBoard: BoardKind;
  initial: Loaded;
  viewerId: string;
}) {
  const [board, setBoard] = useState<BoardKind>(initialBoard);
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<Loaded>(initial);
  const [pending, start] = useTransition();

  function load(nextBoard: BoardKind, nextPeriod: Period) {
    setBoard(nextBoard);
    setPeriod(nextPeriod);
    start(async () => {
      const r = await refreshBoard(nextBoard, nextPeriod);
      if (r) setData(r);
    });
  }

  const top = data.rows.filter((r) => r.total > 0).slice(0, 3);
  const showArrows = period === "month";
  const meBelow = data.me && !top.some((t) => t.id === data.me?.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Leaderboard" description="Verified deposits only. A reversed deposit comes off at once." />
      <div className="flex flex-wrap items-end justify-between gap-4">
        {boards.length > 1 ? (
          <Tabs
            idPrefix="board"
            label="Board"
            value={board}
            onChange={(b) => load(b, period)}
            items={boards.map((b) => ({ value: b, label: BOARD_LABEL[b] }))}
          />
        ) : (
          <h2 className="text-title font-semibold text-tl-text">{BOARD_LABEL[board]}</h2>
        )}
        <div role="group" aria-label="Period" className="flex gap-1 rounded-control bg-tl-raised p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => load(board, p.value)}
              className={cn(
                "h-9 rounded-[6px] px-3 text-label font-semibold",
                period === p.value ? "bg-tl-surface text-tl-text shadow-card" : "text-tl-muted hover:text-tl-text",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-busy={pending} className={cn("flex flex-col gap-6", pending && "opacity-70")}>
        {data.rows.length === 0 ? (
          <EmptyState title="Nothing on this board yet." body="Boards fill as deposits are verified." />
        ) : (
          <>
            {top.length > 0 ? (
              <ol aria-label="Top three" className="grid gap-4 md:grid-cols-3">
                {top.map((r) => (
                  <li key={r.id}>
                    <Card className={cn("flex flex-col items-center gap-3 p-5 text-center", r.rank === 1 && "border-tl-primary")}>
                      <RankBadge rank={r.rank} size={40} />
                      <Person row={r} size={64} />
                      <div>
                        <p className="tl-display text-title text-tl-text">{r.name}</p>
                        <p className="text-label text-tl-muted">{r.detail}</p>
                      </div>
                      <MoneyText amount={r.total} verified className="text-display-m" />
                    </Card>
                  </li>
                ))}
              </ol>
            ) : null}

            <div className="overflow-x-auto rounded-card border border-tl-line bg-tl-surface shadow-card">
              <table className="w-full min-w-[640px] text-left">
                <caption className="sr-only">{BOARD_LABEL[board]} ranked by verified deposits</caption>
                <thead className="bg-tl-bg">
                  <tr>
                    {["Rank", "Name", "Deposits", "Verified total"].map((h, i) => (
                      <th key={h} scope="col" className={cn("border-b border-tl-line px-4 py-2.5 text-label font-semibold text-tl-muted", i === 3 && "text-right")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className={cn("border-t border-tl-line first:border-t-0", r.id === viewerId && "bg-tl-primary-soft")}>
                      <td className="px-4 py-3">
                        <RankBadge rank={r.rank} moved={showArrows ? rankMovement(r.rank, r.prevRank) : undefined} size={32} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <Person row={r} size={28} />
                          <span>
                            <span className="text-body font-semibold text-tl-text">
                              {r.name}
                              {r.id === viewerId ? <span className="text-tl-muted"> (you)</span> : null}
                            </span>
                            <span className="block text-small text-tl-muted">{r.detail}</span>
                          </span>
                          {showStreak(r.streak) ? (
                            <span className="inline-flex items-center gap-0.5 text-small font-semibold text-tl-primary" aria-label={`${r.streak} day streak`}>
                              <Flame aria-hidden className="size-4" />
                              {r.streak}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="tl-amount px-4 py-3 text-body text-tl-text-2">{r.deposits}</td>
                      <td className="px-4 py-3 text-right">
                        <MoneyText amount={r.total} verified={r.total > 0} className="text-body font-semibold" />
                        {r.color ? <span aria-hidden className="ml-2 inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: teamColorVar(r.color) }} /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meBelow && data.me ? (
              <Card aria-label="Your row" className="sticky bottom-4 flex items-center gap-4 border-tl-primary bg-tl-primary-soft p-4">
                <span className="text-label font-semibold text-tl-text">You</span>
                <RankBadge rank={data.me.rank} size={32} />
                <MoneyText amount={data.me.total} verified className="ml-auto text-title" />
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
