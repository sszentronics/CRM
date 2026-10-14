import type { Metadata } from "next";
import { AllLeadsScreen, type LeadListRow } from "@/components/features/leads/all-leads-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { CONTACT_CHANNELS, FRESHNESS, freshnessBounds, TEMPERATURES } from "@/lib/leads/contact";
import { STAGES, type Stage } from "@/lib/leads/stages";
import { getSetting } from "@/lib/settings/get-setting";
import { createClient } from "@/lib/supabase/server";
import type { TeamColor } from "@/lib/teams";

export const metadata: Metadata = { title: "All leads" };

const PAGE_SIZE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const like = (v: string) => `%${v.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export default async function AllLeadsPage({ searchParams }: PageProps<"/leads">) {
  if (!(await requireAccess("/leads"))) return <NoAccess />;
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const filters = {
    stage: STAGES.includes(get("stage") as Stage) ? get("stage") : "",
    team: get("team") === "pool" || UUID.test(get("team")) ? get("team") : "",
    agent: UUID.test(get("agent")) ? get("agent") : "",
    source: get("source"),
    q: get("q").slice(0, 80),
    returned: get("returned") === "1" ? "1" : "",
    interest: (TEMPERATURES as readonly string[]).includes(get("interest")) ? get("interest") : "",
    channel: (CONTACT_CHANNELS as readonly string[]).includes(get("channel")) ? get("channel") : "",
    contact: (FRESHNESS as readonly string[]).includes(get("contact")) ? get("contact") : "",
  };
  const page = Math.max(1, Number.parseInt(get("page") || "1", 10) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select(
      "id, full_name, phone, source, stage, returned_to_lead, created_at, last_activity_at, temperature, last_contacted_at, last_contact_channel, team_id, agent_id, team:teams (name, color), agent:profiles!leads_agent_id_fkey (full_name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filters.stage) query = query.eq("stage", filters.stage);
  if (filters.team === "pool") query = query.is("team_id", null);
  else if (filters.team) query = query.eq("team_id", filters.team);
  if (filters.agent) query = query.eq("agent_id", filters.agent);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.returned) query = query.eq("returned_to_lead", true);
  if (filters.interest) query = query.eq("temperature", filters.interest);
  if (filters.channel) query = query.eq("last_contact_channel", filters.channel);
  if (filters.contact) {
    const { greenFrom, yellowFrom } = freshnessBounds();
    if (filters.contact === "never") query = query.is("last_contacted_at", null);
    else if (filters.contact === "green") query = query.gte("last_contacted_at", greenFrom);
    else if (filters.contact === "yellow") query = query.gte("last_contacted_at", yellowFrom).lt("last_contacted_at", greenFrom);
    else query = query.lt("last_contacted_at", yellowFrom);
  }
  if (filters.q) {
    const digits = filters.q.replace(/\D/g, "");
    query = digits.length >= 3 && /^[+\d\s\-()]+$/.test(filters.q)
      ? query.like("phone", `%${digits.replace(/^0/, "")}%`)
      : query.ilike("full_name", like(filters.q));
  }

  const [{ data, count }, { data: teams }, { data: people }, sources] = await Promise.all([
    query,
    supabase.from("teams").select("id, name, color").eq("is_active", true).order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, role, team_id")
      .in("role", ["agent", "team_lead"])
      .eq("is_active", true)
      .not("team_id", "is", null)
      .order("full_name"),
    getSetting(supabase, "lead_sources"),
  ]);

  return (
    <AllLeadsScreen
      key={JSON.stringify([filters, page, count])}
      rows={(data ?? []) as unknown as LeadListRow[]}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      filters={filters}
      teams={(teams ?? []) as { id: string; name: string; color: TeamColor }[]}
      people={(people ?? []) as { id: string; full_name: string; role: string; team_id: string }[]}
      sources={sources}
    />
  );
}
