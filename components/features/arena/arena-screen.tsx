"use client";

import { Flame, Gift, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { refreshArena } from "@/app/(arena)/arena/actions";
import { Avatar } from "@/components/ui/avatar";
import { MoneyText } from "@/components/ui/money-text";
import { RankBadge } from "@/components/ui/rank-badge";
import { SlantBar } from "@/components/ui/slant-bar";
import { ROLE_HOME, type Role } from "@/lib/auth/roles";
import { laneShare, PERIODS, rankMovement, showStreak, type Period } from "@/lib/boards/periods";
import type { AgentRow, AnalystRow, ArenaData, FeedRow, TeamRow } from "@/lib/boards/types";
import { timeAgo } from "@/lib/format/dates";
import { formatPKR, formatPKRCompact } from "@/lib/format/money";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { authorizeRealtime, createBrowserSupabase } from "@/lib/supabase/browser";
import { teamColorVar } from "@/lib/teams";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;
const ROTATE_MS = 20_000;
const BURST_MS = 1_200;
const SHARDS = 12;

const muted = "text-[#d6ccf2]";
const panel = "rounded-card border border-white/10 bg-white/[0.06]";

// A ticking clock for TV mode, read the React way so render stays pure.
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;
function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  clockTimer ??= setInterval(() => clockListeners.forEach((l) => l()), 1_000);
  return () => {
    clockListeners.delete(cb);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}
const clockNow = () => Math.floor(Date.now() / 1_000);
function useClock() {
  const secs = useSyncExternalStore(subscribeClock, clockNow, () => 0);
  return secs === 0 ? "" : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" }).format(new Date(secs * 1_000));
}

type Burst = { key: string; teamId: string };

/** Twelve slanted shards in the team colour and white, thrown from the end of the bar. Plays once. */
function ShardBurst({ color }: { color: string }) {
  return (
    <span aria-hidden data-testid="burst" className="pointer-events-none absolute top-1/2 left-0 size-0">
      {Array.from({ length: SHARDS }, (_, i) => {
        const angle = (i / SHARDS) * Math.PI * 2;
        const dist = 46 + (i % 3) * 18;
        const style = {
          "--dx": `${Math.round(Math.cos(angle) * dist)}px`,
          "--dy": `${Math.round(Math.sin(angle) * dist)}px`,
          "--rot": `${i * 37}deg`,
          backgroundColor: i % 2 ? "#fff" : color,
        } as CSSProperties;
        return <span key={i} className="tl-shard absolute block h-3.5 w-2" style={style} />;
      })}
    </span>
  );
}

function Lane({ team, period, leaderTotal, tv, height, index, burst, rank }: {
  team: TeamRow;
  period: Period;
  leaderTotal: number;
  tv: boolean;
  height: number;
  index: number;
  burst: boolean;
  rank: number;
}) {
  const { value, target, pct } = laneShare(period, team.total, team.target, leaderTotal);
  const color = teamColorVar(team.color);
  const share = Math.min(value / target, 1) * 0.88;
  return (
    <li
      aria-label={`${team.name}, rank ${rank}`}
      className={cn("grid items-center gap-x-4 gap-y-2 py-1", "grid-cols-[auto_1fr_auto] lg:grid-cols-[auto_minmax(0,300px)_1fr_auto_auto]")}
      style={{ minHeight: height }}
    >
      <RankBadge rank={rank} moved={period === "month" ? rankMovement(rank, team.prevRank) : undefined} size={tv ? 48 : 40} />
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={team.leadName} src={team.leadPhoto} size={tv ? 64 : 40} team={team.color} />
        <div className="min-w-0">
          <p className={cn("tl-display truncate text-white", tv ? "text-display-m" : "text-title")}>{team.name}</p>
          <p className={cn("truncate text-label", muted)}>{team.leadName}</p>
          {team.prize ? (
            <p className="flex items-center gap-1 truncate text-small font-semibold text-white">
              <Gift aria-hidden className="size-3.5 shrink-0" />
              Prize: {team.prize}
            </p>
          ) : null}
        </div>
      </div>
      <div className="relative col-span-3 order-last lg:order-none lg:col-span-1">
        <div className="tl-lane-fill" style={{ animationDelay: `${index * 80}ms` }}>
          <SlantBar value={value} target={target} color={color} height={tv ? 36 : 28} showTick={pct !== null} label={`${team.name} progress`} />
        </div>
        {burst ? (
          <span className="absolute inset-y-0 left-0 w-full">
            <span className="absolute inset-y-0" style={{ left: `${share * 100}%` }}>
              <ShardBurst color={color} />
            </span>
          </span>
        ) : null}
      </div>
      <MoneyText amount={team.total} verified countUp className={cn("text-right !text-white", tv ? "text-display-l" : "text-title")} />
      <span className={cn("tl-amount w-14 text-right text-label font-semibold", muted)}>{pct === null ? "" : `${pct}%`}</span>
    </li>
  );
}

function Streak({ days }: { days: number }) {
  if (!showStreak(days)) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-small font-semibold text-white" aria-label={`${days} day streak`}>
      <Flame aria-hidden className="size-4" />
      {days}
    </span>
  );
}

function AgentList({ rows, period, viewerId, big, columns }: { rows: AgentRow[]; period: Period; viewerId: string; big: boolean; columns: boolean }) {
  if (rows.length === 0) return <p className={cn("px-4 py-6 text-body", muted)}>No agents yet.</p>;
  return (
    <ol aria-label="Top agents" className={cn("grid gap-x-8 px-4 pb-3", columns && "grid-cols-2 grid-flow-col grid-rows-5")}>
      {rows.map((a) => (
        <li key={a.agentId} id={`agent-${a.agentId}`} className={cn("flex items-center gap-3 py-1.5", a.agentId === viewerId && "rounded-control bg-white/10 px-2")}>
          <RankBadge rank={a.rank} moved={period === "month" ? rankMovement(a.rank, a.prevRank) : undefined} size={big ? 36 : 32} />
          <Avatar name={a.name} src={a.photo} size={28} team={a.color ?? undefined} />
          <span className={cn("min-w-0 flex-1 truncate font-semibold text-white", big ? "text-body" : "text-label")}>{firstAndInitial(a.name)}</span>
          <Streak days={a.streak} />
          <span className="tl-display tl-amount text-label text-white">{formatPKR(a.total)}</span>
        </li>
      ))}
    </ol>
  );
}

function AnalystList({ rows }: { rows: AnalystRow[] }) {
  if (rows.length === 0) return <p className={cn("px-4 py-6 text-body", muted)}>No analysts yet.</p>;
  return (
    <ol aria-label="Top analysts" className="flex flex-col px-4 pb-3">
      {rows.map((a) => (
        <li key={a.analystId} className="flex items-center gap-3 py-1.5">
          <RankBadge rank={a.rank} size={32} />
          <Avatar name={a.name} src={a.photo} size={28} />
          <span className="min-w-0 flex-1 truncate text-label font-semibold text-white">{firstAndInitial(a.name)}</span>
          <span className="tl-display tl-amount text-label text-white">{formatPKR(a.total)}</span>
          <span className={cn("w-16 text-right text-small", muted)}>{a.sessions} sess.</span>
        </li>
      ))}
    </ol>
  );
}

function Feed({ rows, limit }: { rows: FeedRow[]; limit: number }) {
  if (rows.length === 0) {
    return <p className={cn("px-4 py-6 text-body", muted)}>New month, clean board. The first verified deposit takes the lead.</p>;
  }
  return (
    <ol aria-label="Live deposits" className="flex flex-col px-4 pb-3">
      {rows.slice(0, limit).map((f) => (
        <li key={f.id} className="flex items-center gap-3 py-1.5 text-label">
          <span className="w-28 truncate font-semibold" style={{ color: teamColorVar(f.color) }}>
            {f.teamName}
          </span>
          <span className="tl-display tl-amount font-semibold text-[var(--tl-win-on-dark)]">+ {formatPKR(f.amount)}</span>
          <span className="min-w-0 flex-1 truncate text-white">{f.agentName}</span>
          <span className={cn("shrink-0 text-small", muted)}>{timeAgo(f.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}

const firstAndInitial = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn(panel, className)}>
      <h2 className="px-4 pt-3 pb-1 text-title font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

type SideTab = "agents" | "live" | "analysts";

export function ArenaScreen({ initial, role, tv }: { initial: ArenaData; role: Role; tv: boolean }) {
  const reduced = useReducedMotion();
  const [data, setData] = useState(initial);
  const [period, setPeriod] = useState<Period>("month");
  const [connected, setConnected] = useState(true);
  const [burst, setBurst] = useState<Burst | null>(null);
  const [tab, setTab] = useState<SideTab>("agents");
  const [tvView, setTvView] = useState<"agents" | "analysts">("agents");
  const clock = useClock();
  const busy = useRef(false);
  const periodRef = useRef(period);
  const viewerId = data.me?.id ?? "";

  const pull = useCallback(async (p: Period) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const next = await refreshArena(p);
      if (next && periodRef.current === p) setData(next);
    } catch {
      // The numbers stay as they were; the next pull tries again.
    } finally {
      busy.current = false;
    }
  }, []);

  function choosePeriod(p: Period) {
    periodRef.current = p;
    setPeriod(p);
    void pull(p);
  }

  // Live: a verified deposit arrives over Realtime. Every ten seconds we also pull, which covers reversals.
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;
    void authorizeRealtime(supabase).then(() => {
      if (stopped) return;
      channel = supabase
        .channel("arena-feed")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "feed_events" }, (payload) => {
          const row = payload.new as { id: string; team_id: string };
          if (!reducedRef.current) {
            setBurst({ key: row.id, teamId: row.team_id });
            setTimeout(() => setBurst((b) => (b?.key === row.id ? null : b)), BURST_MS);
          }
          void pull(periodRef.current);
        })
        .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    });
    const timer = setInterval(() => void pull(periodRef.current), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [pull]);

  // TV mode: Teams with Agents, then Teams with Analysts, every 20 seconds.
  useEffect(() => {
    if (!tv) return;
    const timer = setInterval(() => setTvView((v) => (v === "agents" ? "analysts" : "agents")), ROTATE_MS);
    return () => clearInterval(timer);
  }, [tv]);

  const leaderTotal = Math.max(...data.teams.map((t) => t.total), 0);
  const laneHeight = tv ? (data.teams.length > 4 ? 76 : 96) : 72;
  const showYou = !tv && data.me !== null;

  return (
    <div className={cn("mx-auto flex min-h-dvh w-full flex-col gap-5 px-4 py-5 lg:px-8", tv ? "max-w-[1840px] gap-4 py-6" : "max-w-[1440px]", showYou && "pb-24")}>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="flex items-center gap-3">
          <Image src="/brand/tl-logo.png" alt="Trading Labs" width={tv ? 69 : 36} height={tv ? 72 : 38} priority />
          <h1 className={cn("tl-display text-white", tv ? "text-display-l" : "text-display-m")}>The Arena</h1>
        </span>
        {tv ? (
          <span className={cn("tl-display tl-amount ml-auto text-display-m", muted)} aria-label="Time in Karachi">{clock}</span>
        ) : (
          <>
            <div role="group" aria-label="Period" className="flex gap-1 rounded-control bg-white/10 p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={period === p.value}
                  onClick={() => choosePeriod(p.value)}
                  className={cn(
                    "h-9 rounded-[6px] px-3 text-label font-semibold transition-colors",
                    period === p.value ? "bg-white text-tl-brand" : "text-[#d6ccf2] hover:bg-white/10 hover:text-white",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Link href={ROLE_HOME[role]} className={cn("ml-auto text-label font-semibold underline-offset-4 hover:underline", muted)}>
              Back to the CRM
            </Link>
          </>
        )}
        <span className={cn("text-label font-semibold text-white", tv && "text-title")}>
          {data.strip.daysLeft} {data.strip.daysLeft === 1 ? "day" : "days"} left
        </span>
        {!connected ? (
          <span role="status" className="flex items-center gap-2 text-label font-semibold text-white">
            <span aria-hidden className="size-2.5 rounded-full bg-tl-wait" />
            Reconnecting
          </span>
        ) : null}
      </header>

      <section aria-label="Team race" className={cn(panel, "px-4 py-2 lg:px-6")}>
        {data.teams.length === 0 ? (
          <p className={cn("py-6 text-body", muted)}>No teams yet. The Superadmin or an Admin adds them.</p>
        ) : (
          <ol className="divide-y divide-white/10">
            {data.teams.map((t, i) => (
              <Lane
                key={t.teamId}
                team={t}
                rank={t.rank}
                index={i}
                period={period}
                leaderTotal={leaderTotal}
                tv={tv}
                height={laneHeight}
                burst={burst?.teamId === t.teamId}
              />
            ))}
          </ol>
        )}
        {data.teams.some((t) => t.target && period === "month" && t.total > t.target) ? (
          <p className={cn("flex items-center gap-1 pb-2 text-small", muted)}>
            <Plus aria-hidden className="size-3.5" /> A team past its target keeps counting.
          </p>
        ) : null}
      </section>

      {/* Wide windows and TV: the three panels sit side by side. */}
      <div className={cn("hidden gap-5 lg:grid", tv ? "grid-cols-[3fr_2fr]" : "grid-cols-[3fr_2fr]")}>
        {tv ? (
          tvView === "agents" ? (
            <Panel title="Top agents">
              <AgentList rows={data.agents} period={period} viewerId={viewerId} big columns />
            </Panel>
          ) : (
            <Panel title="Top analysts">
              <AnalystList rows={data.analysts} />
            </Panel>
          )
        ) : (
          <Panel title="Top agents">
            <AgentList rows={data.agents} period={period} viewerId={viewerId} big={false} columns={false} />
          </Panel>
        )}
        <div className="flex flex-col gap-5">
          <Panel title="Live">
            <Feed rows={data.feed} limit={tv ? 6 : 8} />
          </Panel>
          {!tv ? (
            <Panel title="Top analysts">
              <AnalystList rows={data.analysts} />
            </Panel>
          ) : null}
        </div>
      </div>

      {/* Narrow windows: the same panels as three tabs. */}
      <div className="flex flex-col gap-3 lg:hidden">
        <div role="tablist" aria-label="Arena panels" className="flex gap-1 rounded-control bg-white/10 p-1">
          {(["agents", "live", "analysts"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("h-9 flex-1 rounded-[6px] text-label font-semibold capitalize", tab === t ? "bg-white text-tl-brand" : "text-[#d6ccf2]")}
            >
              {t === "live" ? "Live" : t === "agents" ? "Top agents" : "Top analysts"}
            </button>
          ))}
        </div>
        <div className={panel}>
          {tab === "agents" ? (
            <AgentList rows={data.agents} period={period} viewerId={viewerId} big={false} columns={false} />
          ) : tab === "live" ? (
            <Feed rows={data.feed} limit={8} />
          ) : (
            <AnalystList rows={data.analysts} />
          )}
        </div>
      </div>

      <section aria-label="This month" className={cn(panel, "mt-auto grid grid-cols-1 gap-4 px-6 py-4 sm:grid-cols-3")}>
        {[
          { value: formatPKR(data.strip.monthTotal), label: "verified this month" },
          { value: String(data.strip.newFunded), label: "new funded clients" },
          { value: formatPKRCompact(data.strip.biggestWeek), label: "biggest deposit this week" },
        ].map((s) => (
          <p key={s.label} className="flex flex-col">
            <span className={cn("tl-display tl-amount text-white", tv ? "text-display-l" : "text-title")}>{s.value}</span>
            <span className={cn("text-label", muted)}>{s.label}</span>
          </p>
        ))}
      </section>

      {showYou && data.me ? (
        <a
          href={data.me.kind === "agent" ? `#agent-${viewerId}` : "#"}
          aria-label="Your standing"
          className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-center gap-4 border-t border-white/15 bg-[#220b47] px-4 py-3"
        >
          <span className="text-label font-semibold text-white">You</span>
          <RankBadge rank={data.me.rank} size={32} />
          <MoneyText amount={data.me.total} verified countUp className="text-title !text-white" />
          <Streak days={data.me.streak} />
        </a>
      ) : null}
    </div>
  );
}
