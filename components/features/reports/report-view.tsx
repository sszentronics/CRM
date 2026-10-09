import Link from "next/link";
import { PageHeader } from "@/components/features/shell/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PERIODS } from "@/lib/boards/periods";
import { formatPKR } from "@/lib/format/money";
import { STAGE_LABEL, type Stage } from "@/lib/leads/stages";
import { REPORTS, type CellKind } from "@/lib/reports/definitions";
import type { ReportFilters } from "@/lib/reports/params";
import { cn } from "@/lib/utils";

type Report = (typeof REPORTS)[number];
type Row = Record<string, string | number | null>;

function cell(kind: CellKind, value: string | number | null): string {
  if (value === null || value === undefined) return "";
  switch (kind) {
    case "money":
      return formatPKR(Number(value));
    case "percent":
      return `${Number(value)}%`;
    case "number":
      return String(Number(value));
    case "stage":
      return STAGE_LABEL[value as Stage] ?? String(value);
    default:
      return String(value);
  }
}

function href(report: string, f: ReportFilters) {
  const q = new URLSearchParams({ report, period: f.period });
  if (f.team) q.set("team", f.team);
  if (f.broker) q.set("broker", f.broker);
  return `/reports?${q.toString()}`;
}

/** One report: a switch between the seven, the filters, a bar chart and the table behind it. */
export function ReportView({
  report,
  rows,
  filters,
  teams,
  brokers,
}: {
  report: Report;
  rows: Row[];
  filters: ReportFilters;
  teams: { id: string; name: string }[];
  brokers: { id: string; name: string }[];
}) {
  const max = Math.max(...rows.map((r) => Number(r[report.chart.value] ?? 0)), 0);
  const chartKind = report.columns.find((c) => c.key === report.chart.value)?.kind ?? "number";
  const labelKind = report.columns.find((c) => c.key === report.chart.label)?.kind ?? "text";
  const control = "h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Verified deposits only. Pick a report, then narrow it by period, team or broker." />

      <nav aria-label="Reports" className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <Link
            key={r.id}
            href={href(r.id, filters)}
            aria-current={r.id === report.id ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-4 text-label font-semibold",
              r.id === report.id ? "border-tl-primary bg-tl-primary text-white" : "border-tl-line-strong bg-tl-surface text-tl-text-2 hover:bg-tl-raised",
            )}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <form method="get" action="/reports" aria-label="Report filters" className="flex flex-wrap items-end gap-4">
        <input type="hidden" name="report" value={report.id} />
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Period
          <select name="period" defaultValue={filters.period} className={control}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Team
          <select name="team" defaultValue={filters.team ?? ""} className={control}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Broker
          <select name="broker" defaultValue={filters.broker ?? ""} className={control}>
            <option value="">All brokers</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 rounded-control bg-tl-primary px-4 text-body font-semibold text-white hover:bg-tl-primary-hover">
          Apply filters
        </button>
      </form>

      <section aria-label={report.label} className="flex flex-col gap-4">
        <p className="text-body text-tl-muted">{report.blurb}</p>
        {rows.length === 0 ? (
          <EmptyState title="Nothing to show for these filters." body="Try a longer period, or clear the team and broker." />
        ) : (
          <>
            <Card>
              <ul aria-label={`${report.label} chart`} className="flex flex-col gap-2">
                {rows.map((r, i) => {
                  const v = Number(r[report.chart.value] ?? 0);
                  return (
                    <li key={i} className="grid grid-cols-[180px_1fr_auto] items-center gap-3">
                      <span className="truncate text-label text-tl-text-2">{cell(labelKind, r[report.chart.label])}</span>
                      <span className="h-5 rounded-control bg-tl-raised">
                        <span className="block h-full rounded-control bg-tl-primary" style={{ width: `${max > 0 ? Math.max((v / max) * 100, v > 0 ? 1.5 : 0) : 0}%` }} />
                      </span>
                      <span className="tl-amount w-36 text-right text-label font-semibold text-tl-text">{cell(chartKind, v)}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <div className="overflow-x-auto rounded-card border border-tl-line bg-tl-surface shadow-card">
              <table className="w-full min-w-[640px] text-left">
                <caption className="sr-only">{report.label} data</caption>
                <thead className="bg-tl-bg">
                  <tr>
                    {report.columns.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className={cn("border-b border-tl-line px-4 py-2.5 text-label font-semibold text-tl-muted", c.kind !== "text" && c.kind !== "stage" && "text-right")}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-tl-line first:border-t-0">
                      {report.columns.map((c) => (
                        <td key={c.key} className={cn("px-4 py-2.5 text-body text-tl-text-2", c.kind !== "text" && c.kind !== "stage" ? "tl-amount text-right" : "font-semibold text-tl-text")}>
                          {cell(c.kind, r[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
