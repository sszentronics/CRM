import type { Metadata } from "next";
import { AssignScreen, type Person, type TeamLeadRow } from "@/components/features/leads/assign-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { OPEN_STAGES } from "@/lib/leads/stage-machine";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assign leads" };

export default async function AssignLeadsPage() {
  const ctx = await requireAccess("/team/assign");
  if (!ctx) return <NoAccess />;
  const teamId = ctx.profile.team_id;
  if (!teamId) return <NoAccess message="You do not lead a team yet. Ask an Admin to set your team." />;

  const supabase = await createClient();
  const [{ data: team }, { data: leads }, { data: people }, { data: load }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", teamId).single(),
    supabase
      .from("leads")
      .select("id, full_name, phone, source, stage, agent_id, returned_to_lead, agent_assigned_at, created_at")
      .eq("team_id", teamId)
      .in("stage", OPEN_STAGES as string[])
      .order("created_at", { ascending: true })
      .limit(2000),
    supabase.from("profiles").select("id, full_name, role, photo_url, is_active").eq("team_id", teamId).eq("is_active", true),
    supabase.rpc("agent_workload", { p_team_id: teamId }),
  ]);

  const loadBy = new Map(((load ?? []) as { agent_id: string; open_leads: number; assigned_today: number }[]).map((l) => [l.agent_id, l]));
  const team_people: Person[] = ((people ?? []) as { id: string; full_name: string; role: string; photo_url: string | null }[])
    .filter((p) => p.role === "agent" || p.role === "team_lead")
    .map((p) => ({
      id: p.id,
      name: p.full_name,
      photo: p.photo_url,
      isLead: p.role === "team_lead",
      isMe: p.id === ctx.userId,
      open: Number(loadBy.get(p.id)?.open_leads ?? 0),
      today: Number(loadBy.get(p.id)?.assigned_today ?? 0),
    }))
    .sort((a, b) => Number(a.isLead) - Number(b.isLead) || a.name.localeCompare(b.name));

  return (
    <AssignScreen
      key={JSON.stringify((leads ?? []).map((l) => [l.id, l.agent_id]))}
      teamName={(team?.name as string) ?? "Your team"}
      leads={(leads ?? []) as TeamLeadRow[]}
      people={team_people}
    />
  );
}
