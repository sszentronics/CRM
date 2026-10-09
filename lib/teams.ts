/** Team colours (DESIGN.md section 3). A team's colour appears on its lane, avatar ring and chart series only. */
export const TEAM_COLORS = ["cyan", "coral", "pink", "lemon", "sky", "lilac"] as const;
export type TeamColor = (typeof TEAM_COLORS)[number];

export function teamColorVar(color: TeamColor): string {
  return `var(--tl-team-${color})`;
}
