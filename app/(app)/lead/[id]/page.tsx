import type { Metadata } from "next";
import { LeadScreen, type LeadView, type TimelineItem } from "@/components/features/lead/lead-screen";
import type { DocumentRow } from "@/components/features/kyc/checklist";
import type { BrokerOption, KycProfileRow } from "@/components/features/kyc/documents-panel";
import type { AnalystLoad } from "@/components/features/sessions/refer-sheet";
import type { SessionRow } from "@/components/features/sessions/session-panel";
import { NoAccess } from "@/components/features/shell/no-access";
import type { DepositRow } from "@/components/features/deposits/deposits-panel";
import { requireAccess } from "@/lib/auth/session";
import { karachiToday } from "@/lib/format/dates";
import { getAllSettings } from "@/lib/settings/get-setting";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lead" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_ACCESS = "This lead belongs to another team.";

export default async function LeadPage({ params }: PageProps<"/lead/[id]">) {
  const ctx = await requireAccess("/lead");
  if (!ctx) return <NoAccess />;
  const { id } = await params;
  if (!UUID.test(id)) return <NoAccess message={NO_ACCESS} />;

  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      "id, full_name, phone, city, source, campaign, notes, stage, team_id, agent_id, next_follow_up_at, no_answer_count, close_reason, credited_analyst_id, invalid_confirmed_by, returned_to_lead, agent_assigned_at, last_activity_at, temperature, last_contacted_at, last_contact_channel, created_at, created_by, team:teams (name, color, team_lead_id)",
    )
    .eq("id", id)
    .maybeSingle();
  // Not found and not allowed look the same, so a URL reveals nothing about other teams' leads.
  if (!data) return <NoAccess message={NO_ACCESS} />;
  const lead = data as unknown as LeadView;

  const role = ctx.profile.role;
  const isAdmin = role === "admin" || role === "superadmin";
  const leadsTeam = role === "team_lead" && ctx.profile.team_id === lead.team_id;
  const ownsLead = isAdmin || leadsTeam || lead.agent_id === ctx.userId;

  const [{ data: activities }, { data: moves }, settings, { data: sessions }, { data: analysts }, { data: kyc }, { data: brokers }, { data: depositRows }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, created_at, user_id, type, outcome, from_stage, to_stage, notes")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("assignments")
      .select("id, created_at, from_user, to_user, from_team, to_team, assigned_by, reason")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    getAllSettings(supabase),
    supabase
      .from("sessions")
      .select(
        "id, created_at, analyst_id, referred_by, referral_note, preferred_at, scheduled_at, mode, accepted_at, outcome, client_level, interest_level, notes, next_step, handed_back_at, cancelled_at",
      )
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    ownsLead ? supabase.rpc("analyst_load") : Promise.resolve({ data: [] as AnalystLoad[] }),
    // KYC is never shown to analysts; row-level security returns nothing for them anyway.
    ownsLead
      ? supabase
          .from("kyc_profiles")
          .select("id, broker_id, checklist, status, cnic_number, cnic_expiry, mother_name, email, bank_name, iban, income_band, sim_in_own_name, consent_at, risk_level, is_pep, documents (id, type, status, collected_at, reviewed_at, reject_reason)")
          .eq("lead_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ownsLead ? supabase.from("brokers").select("id, name, market").eq("is_active", true).order("name") : Promise.resolve({ data: [] }),
    // Deposits are never shown to analysts; row-level security returns nothing for them anyway.
    ownsLead
      ? supabase
          .from("deposits")
          .select("id, created_at, type, amount_pkr, deposit_date, method, reference_no, cash_flag, status, verified_at, reject_reason, reverse_reason")
          .eq("lead_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const kycRow = kyc as (KycProfileRow & { documents: DocumentRow[] }) | null;

  const deposits = ((depositRows ?? []) as unknown as DepositRow[]).map((d) => ({ ...d, amount_pkr: Number(d.amount_pkr) }));
  const brokerName = kycRow ? ((brokers ?? []) as BrokerOption[]).find((b) => b.id === kycRow.broker_id)?.name ?? null : null;
  const { data: credited } = lead.credited_analyst_id
    ? await supabase.from("profiles_public").select("full_name").eq("id", lead.credited_analyst_id).maybeSingle()
    : { data: null };

  // Names for everyone in the timeline.
  const peopleIds = new Set<string>([lead.agent_id, lead.created_by, lead.team?.team_lead_id].filter(Boolean) as string[]);
  for (const a of activities ?? []) if (a.user_id) peopleIds.add(a.user_id as string);
  for (const s of sessions ?? []) for (const k of ["analyst_id", "referred_by"] as const) if (s[k]) peopleIds.add(s[k] as string);
  for (const m of moves ?? []) for (const k of ["from_user", "to_user", "assigned_by"] as const) if (m[k]) peopleIds.add(m[k] as string);
  const teamIds = new Set<string>();
  for (const m of moves ?? []) for (const k of ["from_team", "to_team"] as const) if (m[k]) teamIds.add(m[k] as string);
  const [{ data: people }, { data: teams }] = await Promise.all([
    supabase.from("profiles_public").select("id, full_name").in("id", [...peopleIds]),
    supabase.from("teams").select("id, name").in("id", [...teamIds]),
  ]);
  const names = Object.fromEntries((people ?? []).map((p) => [p.id as string, p.full_name as string]));
  const teamNames = Object.fromEntries((teams ?? []).map((t) => [t.id as string, t.name as string]));

  const timeline: TimelineItem[] = [
    ...(activities ?? []).map((a) => ({ kind: "activity" as const, ...(a as Omit<Extract<TimelineItem, { kind: "activity" }>, "kind">) })),
    ...(moves ?? []).map((m) => ({ kind: "move" as const, ...(m as Omit<Extract<TimelineItem, { kind: "move" }>, "kind">) })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <LeadScreen
      lead={lead}
      timeline={timeline}
      names={names}
      teamNames={teamNames}
      sessions={(sessions ?? []) as SessionRow[]}
      kyc={kycRow}
      documents={kycRow?.documents ?? []}
      brokers={(brokers ?? []) as BrokerOption[]}
      deposits={deposits}
      depositInfo={{
        brokerName,
        analystName: (credited?.full_name as string | undefined) ?? null,
        cashLimit: settings.cash_flag_limit_pkr,
        today: karachiToday(),
        kycReady: kycRow?.status === "submitted" || kycRow?.status === "approved",
      }}
      analysts={((analysts ?? []) as AnalystLoad[]).map((a) => ({ ...a, open_sessions: Number(a.open_sessions) }))}
      viewer={{
        id: ctx.userId,
        ownsLead,
        isAnalyst: role === "analyst",
        canWork: ownsLead || role === "analyst",
        canConfirmInvalid: isAdmin || leadsTeam,
        isAdmin,
      }}
      settings={{
        maxTries: settings.max_call_tries,
        firstCallHours: settings.first_call_deadline_hours,
        coolingOffDays: settings.cooling_off_days,
        reasons: { notInterested: settings.not_interested_reasons, invalid: settings.invalid_reasons },
      }}
    />
  );
}
