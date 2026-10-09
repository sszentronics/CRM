import type { Metadata } from "next";
import { TodayScreen, type DocToFix, type TodayLead } from "@/components/features/calls/today-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { karachiDayBounds } from "@/lib/format/dates";
import { OPEN_STAGES } from "@/lib/leads/stage-machine";
import { getAllSettings } from "@/lib/settings/get-setting";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Today's calls" };

export default async function TodayPage() {
  const ctx = await requireAccess("/today");
  if (!ctx) return <NoAccess />;
  const supabase = await createClient();
  const { start } = karachiDayBounds();

  const [{ data: leads }, { count: callsToday }, settings, { data: rejected }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, full_name, phone, stage, source, next_follow_up_at, agent_assigned_at, last_activity_at, no_answer_count")
      .eq("agent_id", ctx.userId)
      .in("stage", OPEN_STAGES as string[])
      .order("next_follow_up_at", { ascending: true, nullsFirst: true })
      .limit(1000),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("type", "call")
      .gte("created_at", start.toISOString()),
    getAllSettings(supabase),
    // Documents the Admin rejected on this person's clients.
    supabase
      .from("documents")
      .select("id, type, reject_reason, reviewed_at, kyc:kyc_profiles!inner (lead:leads!inner (id, full_name, agent_id))")
      .eq("status", "rejected")
      .eq("kyc.lead.agent_id", ctx.userId)
      .order("reviewed_at", { ascending: true })
      .limit(100),
  ]);

  return (
    <TodayScreen
      firstName={ctx.profile.full_name.split(" ")[0]}
      leads={(leads ?? []) as TodayLead[]}
      callsToday={callsToday ?? 0}
      docsToFix={(rejected ?? []) as unknown as DocToFix[]}
      firstCallHours={settings.first_call_deadline_hours}
      reasons={{ notInterested: settings.not_interested_reasons, invalid: settings.invalid_reasons }}
    />
  );
}
