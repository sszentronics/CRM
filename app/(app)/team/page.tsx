import type { Metadata } from "next";
import { TeamDashboard, type PoolLead, type TeamOverview } from "@/components/features/dashboards/team-dashboard";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { periodBounds } from "@/lib/boards/periods";
import { createClient } from "@/lib/supabase/server";
import type { TeamColor } from "@/lib/teams";

export const metadata: Metadata = { title: "Team dashboard" };

const LEAD_COLUMNS = "id, full_name, stage, source, last_activity_at, created_at";

export default async function TeamPage() {
  const ctx = await requireAccess("/team");
  if (!ctx) return <NoAccess />;
  const teamId = ctx.profile.team_id;
  if (!teamId) return <NoAccess message="You are not leading a team yet. The Admin sets that up." />;

  const supabase = await createClient();
  const { from, to } = periodBounds("month");
  const [{ data: overview }, { data: board }, { data: unassigned }, { data: returned }] = await Promise.all([
    supabase.rpc("team_overview"),
    // The same function the Arena uses, so the totals always match.
    supabase.rpc("board_teams", { p_from: from.toISOString(), p_to: to.toISOString() }),
    supabase.from("leads").select(LEAD_COLUMNS).eq("team_id", teamId).is("agent_id", null).in("stage", ["new", "assigned", "no_answer", "follow_up", "interested", "documents_pending"]).order("created_at", { ascending: true }).limit(8),
    supabase.from("leads").select(LEAD_COLUMNS).eq("team_id", teamId).is("agent_id", null).eq("returned_to_lead", true).order("last_activity_at", { ascending: true }).limit(8),
  ]);

  const rows = (board ?? []) as { team_id: string; team_name: string; color: TeamColor; rank: number; total_pkr: number; target_pkr: number | null; prize: string | null }[];
  const mine = rows.find((r) => r.team_id === teamId);
  if (!overview || !mine) return <NoAccess message="Your team could not be loaded." />;

  return (
    <TeamDashboard
      banner={{
        name: mine.team_name,
        color: mine.color,
        rank: Number(mine.rank),
        teams: rows.length,
        total: Number(mine.total_pkr),
        target: mine.target_pkr === null ? null : Number(mine.target_pkr),
        prize: mine.prize,
      }}
      overview={overview as unknown as TeamOverview}
      unassigned={(unassigned ?? []) as PoolLead[]}
      returned={(returned ?? []) as PoolLead[]}
    />
  );
}
