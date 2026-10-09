import type { Metadata } from "next";
import { BrokersScreen, type BrokerRow } from "@/components/features/brokers/brokers-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Brokers" };

export default async function BrokersPage() {
  if (!(await requireAccess("/brokers"))) return <NoAccess />;
  const supabase = await createClient();
  const { data } = await supabase
    .from("brokers")
    .select("id, name, market, kyc_checklist, is_active, updated_at")
    .order("is_active", { ascending: false })
    .order("name");
  return <BrokersScreen brokers={(data ?? []) as BrokerRow[]} />;
}
