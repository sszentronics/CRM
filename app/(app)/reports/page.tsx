import type { Metadata } from "next";
import { ReportView } from "@/components/features/reports/report-view";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { periodBounds } from "@/lib/boards/periods";
import { isReportId, REPORTS } from "@/lib/reports/definitions";
import { parseReportFilters } from "@/lib/reports/params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  if (!(await requireAccess("/reports"))) return <NoAccess />;
  const sp = await searchParams;
  const asked = Array.isArray(sp.report) ? sp.report[0] : sp.report;
  const report = REPORTS.find((r) => r.id === (isReportId(asked) ? asked : "funnel"))!;
  const filters = parseReportFilters(sp);
  const { from, to } = periodBounds(filters.period);

  const supabase = await createClient();
  const [{ data }, { data: teams }, { data: brokers }] = await Promise.all([
    supabase.rpc("report_data", { p_report: report.id, p_from: from.toISOString(), p_to: to.toISOString(), p_team: filters.team, p_broker: filters.broker }),
    supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
    supabase.from("brokers").select("id, name").order("name"),
  ]);

  return (
    <ReportView
      report={report}
      rows={(data ?? []) as Record<string, string | number | null>[]}
      filters={filters}
      teams={(teams ?? []) as { id: string; name: string }[]}
      brokers={(brokers ?? []) as { id: string; name: string }[]}
    />
  );
}
