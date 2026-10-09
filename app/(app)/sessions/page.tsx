import type { Metadata } from "next";
import { SessionQueue, type MySession, type OpenReferral, type AdminSession } from "@/components/features/sessions/session-queue";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { isReferralLate } from "@/lib/sessions/rules";
import { getSetting } from "@/lib/settings/get-setting";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Session queue" };

export default async function SessionsPage() {
  const ctx = await requireAccess("/sessions");
  if (!ctx) return <NoAccess />;
  const supabase = await createClient();
  const isAnalyst = ctx.profile.role === "analyst";

  if (isAnalyst) {
    const [{ data: referrals }, { data: mine }, { data: credit }] = await Promise.all([
      supabase.rpc("open_referrals"),
      supabase
        .from("sessions")
        .select("id, lead_id, scheduled_at, preferred_at, mode, referral_note, created_at, lead:leads (full_name, source, city)")
        .eq("analyst_id", ctx.userId)
        .not("accepted_at", "is", null)
        .is("handed_back_at", null)
        .is("cancelled_at", null)
        .order("scheduled_at", { ascending: true, nullsFirst: true }),
      supabase.rpc("my_analyst_credit"),
    ]);
    const c = ((credit ?? []) as { credited_clients: number; sessions_held: number; verified_pkr: number; verified_deposits: number }[])[0];
    return (
      <SessionQueue
        mode="analyst"
        firstName={ctx.profile.full_name.split(" ")[0]}
        referrals={(referrals ?? []) as OpenReferral[]}
        mine={(mine ?? []) as unknown as MySession[]}
        credit={{ clients: Number(c?.credited_clients ?? 0), sessions: Number(c?.sessions_held ?? 0), verifiedPkr: Number(c?.verified_pkr ?? 0), deposits: Number(c?.verified_deposits ?? 0) }}
        all={[]}
        deadlineHours={0}
      />
    );
  }

  // Admin and Superadmin: every open referral, who has it, and how long it has waited.
  const [{ data: all }, deadlineHours] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, lead_id, created_at, scheduled_at, accepted_at, analyst_id, lead:leads (full_name), analyst:profiles!sessions_analyst_id_fkey (full_name)")
      .is("handed_back_at", null)
      .is("cancelled_at", null)
      .order("created_at", { ascending: true })
      .limit(500),
    getSetting(supabase, "referral_deadline_hours"),
  ]);
  return (
    <SessionQueue
      mode="admin"
      firstName={ctx.profile.full_name.split(" ")[0]}
      referrals={[]}
      mine={[]}
      credit={{ clients: 0, sessions: 0, verifiedPkr: 0, deposits: 0 }}
      all={((all ?? []) as unknown as Omit<AdminSession, "late">[]).map((s) => ({
        ...s,
        late: isReferralLate(s.created_at, s.scheduled_at, deadlineHours),
      }))}
      deadlineHours={deadlineHours}
    />
  );
}
