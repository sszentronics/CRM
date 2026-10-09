import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/auth/roles";
import type { TeamColor } from "@/lib/teams";
import type { BoardKind, BoardRow } from "./kinds";
import { periodBounds, type Period } from "./periods";
import type { AgentRow, AnalystRow, ArenaData, FeedRow, TeamRow } from "./types";

/** The Arena shows at most six teams, one for each team colour. */
export const MAX_LANES = 6;
const num = (v: unknown) => Number(v ?? 0);

type Raw = Record<string, unknown>;

export function mapTeams(rows: Raw[]): TeamRow[] {
  return rows
    .map((r) => ({
      rank: num(r.rank),
      prevRank: r.prev_rank === null ? null : num(r.prev_rank),
      teamId: String(r.team_id),
      name: String(r.team_name),
      color: r.color as TeamColor,
      leadName: String(r.lead_name),
      leadPhoto: (r.lead_photo as string | null) ?? null,
      total: num(r.total_pkr),
      deposits: num(r.deposits),
      target: r.target_pkr === null ? null : num(r.target_pkr),
      prize: (r.prize as string | null) ?? null,
    }))
    .sort((a, b) => a.rank - b.rank);
}

export function mapAgents(rows: Raw[]): AgentRow[] {
  return rows
    .map((r) => ({
      rank: num(r.rank),
      prevRank: r.prev_rank === null ? null : num(r.prev_rank),
      agentId: String(r.agent_id),
      name: String(r.full_name),
      photo: (r.photo_url as string | null) ?? null,
      teamName: (r.team_name as string | null) ?? null,
      color: (r.color as TeamColor | null) ?? null,
      total: num(r.total_pkr),
      deposits: num(r.deposits),
      streak: num(r.streak),
    }))
    .sort((a, b) => a.rank - b.rank);
}

export function mapAnalysts(rows: Raw[]): AnalystRow[] {
  return rows
    .map((r) => ({
      rank: num(r.rank),
      prevRank: r.prev_rank === null ? null : num(r.prev_rank),
      analystId: String(r.analyst_id),
      name: String(r.full_name),
      photo: (r.photo_url as string | null) ?? null,
      total: num(r.total_pkr),
      deposits: num(r.deposits),
      sessions: num(r.sessions_held),
    }))
    .sort((a, b) => a.rank - b.rank);
}

/** Everything the Arena shows for a period. Calls the board functions, which return totals only. */
export async function loadArena(supabase: SupabaseClient, period: Period, viewer: { id: string; role: Role }): Promise<ArenaData> {
  const { from, to } = periodBounds(period);
  const args = { p_from: from.toISOString(), p_to: to.toISOString() };
  const [teams, agents, analysts, strip, feed] = await Promise.all([
    supabase.rpc("board_teams", args),
    supabase.rpc("board_agents", args),
    supabase.rpc("board_analysts", args),
    supabase.rpc("arena_month_strip"),
    supabase.from("feed_events").select("id, created_at, team_id, agent_id, amount_pkr").order("created_at", { ascending: false }).limit(12),
  ]);

  const teamRows = mapTeams((teams.data ?? []) as Raw[]);
  const agentRows = mapAgents((agents.data ?? []) as Raw[]);
  const analystRows = mapAnalysts((analysts.data ?? []) as Raw[]);

  const feedRaw = (feed.data ?? []) as { id: string; created_at: string; team_id: string; agent_id: string; amount_pkr: number }[];
  const agentIds = [...new Set(feedRaw.map((f) => f.agent_id))];
  const { data: people } = agentIds.length ? await supabase.from("profiles_public").select("id, full_name").in("id", agentIds) : { data: [] };
  const first = new Map(((people ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name.split(" ")[0]]));
  const teamById = new Map(teamRows.map((t) => [t.teamId, t]));
  const feedRows: FeedRow[] = feedRaw.map((f) => ({
    id: f.id,
    createdAt: f.created_at,
    teamName: teamById.get(f.team_id)?.name ?? "A team",
    color: teamById.get(f.team_id)?.color ?? "cyan",
    amount: num(f.amount_pkr),
    agentName: first.get(f.agent_id) ?? "An agent",
  }));

  const s = ((strip.data ?? []) as Raw[])[0];
  const mine = agentRows.find((a) => a.agentId === viewer.id);
  const myAnalyst = analystRows.find((a) => a.analystId === viewer.id);
  const me: ArenaData["me"] =
    viewer.role === "analyst" && myAnalyst
      ? { id: viewer.id, kind: "analyst", rank: myAnalyst.rank, total: myAnalyst.total, streak: 0 }
      : mine && (viewer.role === "agent" || viewer.role === "team_lead")
        ? { id: viewer.id, kind: "agent", rank: mine.rank, total: mine.total, streak: mine.streak }
        : null;

  return {
    // Lane order is the rank; quiet teams (no deposits) are sorted by name by the database.
    teams: teamRows.slice(0, MAX_LANES),
    agents: agentRows.slice(0, 10),
    analysts: analystRows.slice(0, 3),
    feed: feedRows,
    strip: {
      monthTotal: num(s?.month_total),
      newFunded: num(s?.new_funded),
      biggestWeek: num(s?.biggest_week),
      daysLeft: num(s?.days_left),
    },
    me,
  };
}

export async function loadBoard(
  supabase: SupabaseClient,
  board: BoardKind,
  period: Period,
  viewer: { id: string; teamId: string | null },
): Promise<{ rows: BoardRow[]; me: BoardRow | null }> {
  const { from, to } = periodBounds(period);
  const args = { p_from: from.toISOString(), p_to: to.toISOString() };
  let rows: BoardRow[] = [];
  if (board === "teams") {
    const { data } = await supabase.rpc("board_teams", args);
    rows = mapTeams((data ?? []) as Raw[]).map((t) => ({
      id: t.teamId, rank: t.rank, prevRank: t.prevRank, name: t.name, photo: t.leadPhoto, detail: `Team Lead ${t.leadName}`,
      color: t.color, total: t.total, deposits: t.deposits, streak: 0,
    }));
  } else if (board === "analysts") {
    const { data } = await supabase.rpc("board_analysts", args);
    rows = mapAnalysts((data ?? []) as Raw[]).map((a) => ({
      id: a.analystId, rank: a.rank, prevRank: a.prevRank, name: a.name, photo: a.photo, detail: `${a.sessions} sessions held`,
      color: null, total: a.total, deposits: a.deposits, streak: 0,
    }));
  } else {
    const { data } = await supabase.rpc(board === "agents" ? "board_agents" : "board_my_team", args);
    rows = mapAgents((data ?? []) as Raw[]).map((a) => ({
      id: a.agentId, rank: a.rank, prevRank: a.prevRank, name: a.name, photo: a.photo, detail: a.teamName ?? "No team",
      color: a.color, total: a.total, deposits: a.deposits, streak: a.streak,
    }));
  }
  return { rows, me: rows.find((r) => r.id === viewer.id) ?? null };
}
