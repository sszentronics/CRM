import type { Metadata } from "next";
import { CompanyDashboard, type CompanyData } from "@/components/features/dashboards/company-dashboard";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { loadArena } from "@/lib/boards/load";
import { isPeriod, periodBounds } from "@/lib/boards/periods";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Company dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireAccess("/dashboard");
  if (!ctx) return <NoAccess />;
  const { period: asked } = await searchParams;
  const period = isPeriod(asked) ? asked : "month";
  const { from, to } = periodBounds(period);
  const supabase = await createClient();
  const [{ data }, arena] = await Promise.all([
    supabase.rpc("company_dashboard", { p_from: from.toISOString(), p_to: to.toISOString() }),
    loadArena(supabase, period, { id: ctx.userId, role: ctx.profile.role }),
  ]);
  return <CompanyDashboard data={data as CompanyData} period={period} teams={arena.teams} feed={arena.feed} />;
}
