import type { Metadata } from "next";
import { DistributionScreen, type PoolRow, type TeamCard } from "@/components/features/leads/distribution-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { TeamColor } from "@/lib/teams";

export const metadata: Metadata = { title: "Lead distribution" };

/** The API returns at most 1,000 rows per request; larger pools are worked in filtered batches. */
const MAX_SHOWN = 1000;

export default async function DistributionPage({ searchParams }: PageProps<"/distribution">) {
  if (!(await requireAccess("/distribution"))) return <NoAccess />;
  const sp = await searchParams;
  const source = typeof sp.source === "string" ? sp.source : "";
  const campaign = typeof sp.campaign === "string" ? sp.campaign.trim() : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const supabase = await createClient();
  let pool = supabase
    .from("leads")
    .select("id, full_name, phone, source, campaign, city, created_at", { count: "exact" })
    .is("team_id", null)
    .eq("stage", "new")
    .order("created_at", { ascending: true })
    .limit(MAX_SHOWN);
  if (source) pool = pool.eq("source", source);
  if (campaign) pool = pool.ilike("campaign", `%${campaign.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  if (q) pool = pool.ilike("full_name", `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);

  const [{ data: rows, count }, { data: allPool }, { data: teams }, { data: load }, { data: leads }] = await Promise.all([
    pool,
    supabase.rpc("pool_summary"),
    supabase.from("teams").select("id, name, color, team_lead_id").eq("is_active", true).order("name"),
    supabase.rpc("team_workload"),
    supabase.from("profiles_public").select("id, full_name, role, team_id"),
  ]);

  const bySource: Record<string, number> = Object.fromEntries(
    ((allPool ?? []) as { source: string; leads: number }[]).map((r) => [r.source, Number(r.leads)]),
  );
  const loadByTeam = new Map(((load ?? []) as { team_id: string; open_leads: number; unassigned_leads: number }[]).map((l) => [l.team_id, l]));
  const people = (leads ?? []) as { id: string; full_name: string; role: string; team_id: string | null }[];

  const teamCards: TeamCard[] = (teams ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    color: t.color as TeamColor,
    lead: people.find((p) => p.id === t.team_lead_id)?.full_name ?? "",
    agents: people.filter((p) => p.team_id === t.id && p.role === "agent").length,
    open: Number(loadByTeam.get(t.id as string)?.open_leads ?? 0),
    unassigned: Number(loadByTeam.get(t.id as string)?.unassigned_leads ?? 0),
  }));

  return (
    <DistributionScreen
      // Start a fresh selection whenever the filters or the pool change.
      key={`${source}|${campaign}|${q}|${count}`}
      rows={(rows ?? []) as PoolRow[]}
      matching={count ?? 0}
      poolTotal={Object.values(bySource).reduce((a, b) => a + b, 0)}
      bySource={bySource}
      teams={teamCards}
      filters={{ source, campaign, q }}
    />
  );
}
