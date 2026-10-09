import type { Metadata } from "next";
import { PipelineScreen, type PipelineLead } from "@/components/features/calls/pipeline-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { OPEN_STAGES } from "@/lib/leads/stage-machine";
import { getAllSettings } from "@/lib/settings/get-setting";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pipeline" };

const CLOSED = ["not_interested", "invalid", "deposit_verified"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const ctx = await requireAccess("/pipeline");
  if (!ctx) return <NoAccess />;
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const isLead = ctx.profile.role === "team_lead" && !!ctx.profile.team_id;
  const filters = {
    view: isLead && get("view") !== "mine" ? "team" : "mine",
    closed: get("closed") === "1" ? "1" : "",
    source: get("source"),
    q: get("q").slice(0, 80),
    agent: UUID.test(get("agent")) ? get("agent") : "",
  };

  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("id, full_name, phone, stage, source, agent_id, next_follow_up_at, last_activity_at, agent_assigned_at, invalid_confirmed_by, returned_to_lead")
    .in("stage", filters.closed ? [...OPEN_STAGES, ...CLOSED] : (OPEN_STAGES as string[]))
    .order("next_follow_up_at", { ascending: true, nullsFirst: true })
    .limit(1000);
  if (filters.view === "team") query = query.eq("team_id", ctx.profile.team_id!);
  else query = query.eq("agent_id", ctx.userId);
  if (filters.view === "team" && filters.agent) query = query.eq("agent_id", filters.agent);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.q) query = query.ilike("full_name", `%${filters.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);

  const [{ data: leads }, settings, { data: people }] = await Promise.all([
    query,
    getAllSettings(supabase),
    isLead
      ? supabase.from("profiles_public").select("id, full_name, role").eq("team_id", ctx.profile.team_id!)
      : Promise.resolve({ data: [] as { id: string; full_name: string; role: string }[] }),
  ]);

  return (
    <PipelineScreen
      leads={(leads ?? []) as PipelineLead[]}
      filters={filters}
      canSeeTeam={isLead}
      staleDays={settings.stale_days}
      sources={settings.lead_sources}
      people={(people ?? []) as { id: string; full_name: string; role: string }[]}
    />
  );
}
