import type { Metadata } from "next";
import { ReviewScreen, type ReviewProfile } from "@/components/features/kyc/review-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Document review" };

export default async function DocumentsPage() {
  if (!(await requireAccess("/documents"))) return <NoAccess />;
  const supabase = await createClient();
  const { data } = await supabase
    .from("kyc_profiles")
    .select(
      "id, status, checklist, updated_at, cnic_number, cnic_expiry, mother_name, email, bank_name, iban, income_band, sim_in_own_name, consent_at, risk_level, is_pep, broker:brokers (name), lead:leads (id, full_name, agent:profiles!leads_agent_id_fkey (full_name), team:teams (name)), documents (id, type, status, collected_at, reviewed_at, reject_reason)",
    )
    .neq("status", "approved")
    .order("updated_at", { ascending: true })
    .limit(500);

  return <ReviewScreen profiles={(data ?? []) as unknown as ReviewProfile[]} />;
}
