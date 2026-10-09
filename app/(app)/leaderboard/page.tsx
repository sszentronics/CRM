import type { Metadata } from "next";
import { LeaderboardScreen } from "@/components/features/leaderboard/leaderboard-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { boardsFor, type BoardKind } from "@/lib/boards/kinds";
import { loadBoard } from "@/lib/boards/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Leaderboard" };

const KINDS: BoardKind[] = ["teams", "agents", "my_team", "analysts"];

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const ctx = await requireAccess("/leaderboard");
  if (!ctx) return <NoAccess />;
  const { board: asked } = await searchParams;
  const allowed = boardsFor(ctx.profile.role, ctx.profile.team_id !== null);
  const wanted = KINDS.find((k) => k === asked);
  // Asking for a board your role cannot open, such as an analyst asking for the team board, is refused.
  if (wanted && !allowed.includes(wanted)) return <NoAccess message="Analysts can open the analyst board. The team and agent boards are for the sales floor." />;
  const board = wanted ?? allowed[0];
  const supabase = await createClient();
  const initial = await loadBoard(supabase, board, "month", { id: ctx.userId, teamId: ctx.profile.team_id });
  return <LeaderboardScreen boards={allowed} initialBoard={board} initial={initial} viewerId={ctx.userId} />;
}
