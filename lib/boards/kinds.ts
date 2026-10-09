import type { Role } from "@/lib/auth/roles";
import type { TeamColor } from "@/lib/teams";

export type BoardKind = "teams" | "agents" | "my_team" | "analysts";
export const BOARD_LABEL: Record<BoardKind, string> = { teams: "Teams", agents: "Agents", my_team: "My team", analysts: "Analysts" };

export type BoardRow = {
  id: string;
  rank: number;
  prevRank: number | null;
  name: string;
  photo: string | null;
  detail: string;
  color: TeamColor | null;
  total: number;
  deposits: number;
  streak: number;
};

/** Which boards a role may open. Analysts see only the analyst board. */
export function boardsFor(role: Role, hasTeam: boolean): BoardKind[] {
  if (role === "analyst") return ["analysts"];
  return hasTeam ? ["teams", "agents", "my_team", "analysts"] : ["teams", "agents", "analysts"];
}
