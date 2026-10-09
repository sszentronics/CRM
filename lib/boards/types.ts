import type { TeamColor } from "@/lib/teams";

/** Totals only. Nothing here names a client or carries a lead id. */
export type TeamRow = {
  rank: number;
  prevRank: number | null;
  teamId: string;
  name: string;
  color: TeamColor;
  leadName: string;
  leadPhoto: string | null;
  total: number;
  deposits: number;
  target: number | null;
  prize: string | null;
};

export type AgentRow = {
  rank: number;
  prevRank: number | null;
  agentId: string;
  name: string;
  photo: string | null;
  teamName: string | null;
  color: TeamColor | null;
  total: number;
  deposits: number;
  streak: number;
};

export type AnalystRow = {
  rank: number;
  prevRank: number | null;
  analystId: string;
  name: string;
  photo: string | null;
  total: number;
  deposits: number;
  sessions: number;
};

export type FeedRow = {
  id: string;
  createdAt: string;
  teamName: string;
  color: TeamColor;
  amount: number;
  agentName: string;
};

export type MonthStrip = { monthTotal: number; newFunded: number; biggestWeek: number; daysLeft: number };

export type Standing = { id: string; kind: "agent" | "analyst"; rank: number; total: number; streak: number } | null;

export type ArenaData = {
  teams: TeamRow[];
  agents: AgentRow[];
  analysts: AnalystRow[];
  feed: FeedRow[];
  strip: MonthStrip;
  me: Standing;
};
