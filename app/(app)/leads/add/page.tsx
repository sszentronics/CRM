import type { Metadata } from "next";
import { AddLeadsScreen } from "@/components/features/leads/add-leads-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings/get-setting";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add leads" };

export default async function AddLeadsPage() {
  if (!(await requireAccess("/leads/add"))) return <NoAccess />;
  const sources = await getSetting(await createClient(), "lead_sources");
  return <AddLeadsScreen sources={sources} />;
}
