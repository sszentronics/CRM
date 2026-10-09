import type { Metadata } from "next";
import { VerificationScreen, type QueueDeposit } from "@/components/features/deposits/verification-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deposit verification" };

type Context = { deposit_id: string; client_name: string; kyc_status: string | null; agent_name: string | null; team_name: string | null };

export default async function DepositsPage() {
  const ctx = await requireAccess("/deposits");
  if (!ctx) return <NoAccess />;
  const supabase = await createClient();

  const { data } = await supabase
    .from("deposits")
    .select("id, lead_id, created_at, type, amount_pkr, deposit_date, method, reference_no, cash_flag, status, verified_at, reject_reason, reverse_reason, created_by")
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = data ?? [];
  const ids = rows.map((d) => d.id as string);
  const leadIds = [...new Set(rows.map((d) => d.lead_id as string))];

  const [{ data: context }, { data: kyc }] = await Promise.all([
    ids.length ? supabase.rpc("deposit_queue_context", { p_deposit_ids: ids }) : Promise.resolve({ data: [] as Context[] }),
    leadIds.length ? supabase.from("kyc_profiles").select("lead_id, bank_name, iban").in("lead_id", leadIds) : Promise.resolve({ data: [] }),
  ]);
  const byDeposit = new Map(((context ?? []) as Context[]).map((c) => [c.deposit_id, c]));
  const bankByLead = new Map(((kyc ?? []) as { lead_id: string; bank_name: string | null; iban: string | null }[]).map((k) => [k.lead_id, k]));

  const deposits = rows.map((d) => {
    const c = byDeposit.get(d.id as string);
    const k = bankByLead.get(d.lead_id as string);
    return {
      ...d,
      amount_pkr: Number(d.amount_pkr),
      client_name: c?.client_name ?? "Unknown",
      agent_name: c?.agent_name ?? null,
      team_name: c?.team_name ?? null,
      kyc_status: c?.kyc_status ?? null,
      kyc_bank: k?.bank_name ?? null,
      kyc_iban: k?.iban ?? null,
    };
  }) as unknown as QueueDeposit[];

  return <VerificationScreen deposits={deposits} viewerId={ctx.userId} />;
}
