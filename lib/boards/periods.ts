import { fromKarachi, karachiParts } from "@/lib/format/dates";

export const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
] as const;

export type Period = (typeof PERIODS)[number]["value"];

export const isPeriod = (v: unknown): v is Period => PERIODS.some((p) => p.value === v);

/** Start (inclusive) and end (exclusive) of a period, in Karachi time. Weeks start on Monday. */
export function periodBounds(period: Period, now: Date = new Date()): { from: Date; to: Date } {
  const p = karachiParts(now);
  switch (period) {
    case "today":
      return { from: fromKarachi(p.year, p.month, p.day), to: fromKarachi(p.year, p.month, p.day + 1) };
    case "week": {
      const dow = new Date(Date.UTC(p.year, p.month, p.day)).getUTCDay(); // 0 = Sunday
      const sinceMonday = (dow + 6) % 7;
      return {
        from: fromKarachi(p.year, p.month, p.day - sinceMonday),
        to: fromKarachi(p.year, p.month, p.day - sinceMonday + 7),
      };
    }
    case "month":
      return { from: fromKarachi(p.year, p.month, 1), to: fromKarachi(p.year, p.month + 1, 1) };
    case "all":
      return { from: new Date("2000-01-01T00:00:00Z"), to: fromKarachi(p.year, p.month, p.day + 1) };
  }
}

/**
 * How full a team's lane is. In "This month" it fills toward the team's target.
 * In other periods there is no target to measure against, so lanes are scaled to the leader.
 */
export function laneShare(period: Period, total: number, target: number | null, leaderTotal: number) {
  if (period === "month" && target && target > 0) return { value: total, target, pct: Math.round((total / target) * 100) as number | null };
  return { value: total, target: Math.max(leaderTotal, 1), pct: null as number | null };
}

/** Movement since yesterday: positive is up. Null when there is nothing to compare. */
export function rankMovement(rank: number, prev: number | null): number | undefined {
  if (prev === null || prev === rank) return undefined;
  return prev - rank;
}

/** Streaks show from day 3. */
export const showStreak = (days: number) => days >= 3;
