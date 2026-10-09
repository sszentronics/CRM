"use client";

import { Download } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { createExport } from "@/app/(app)/exports/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { PERIODS } from "@/lib/boards/periods";
import { EXPORT_KINDS, type ExportKind } from "@/lib/exports/columns";
import { formatKarachi } from "@/lib/format/dates";

export type HistoryRow = {
  id: string;
  created_at: string;
  kind: ExportKind;
  filters: { from?: string; to?: string; team_id?: string | null };
  row_count: number;
  includes_sensitive: boolean;
  who: { full_name: string } | null;
};

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const control = "h-10 w-full rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text";

/** Build a CSV of leads, calls or deposits. Every export is listed below and written to the audit log. */
export function ExportsScreen({ teams, history, canIncludeSensitive }: { teams: { id: string; name: string }[]; history: HistoryRow[]; canIncludeSensitive: boolean }) {
  const toast = useToast();
  const id = useId();
  const [kind, setKind] = useState<ExportKind>("leads");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const teamName = (tid?: string | null) => (tid ? (teams.find((t) => t.id === tid)?.name ?? "A team") : "All teams");

  function run(formData: FormData) {
    start(async () => {
      setError(null);
      const r = await createExport(null, formData);
      if (r?.ok && r.data) {
        download(String(r.data.filename), String(r.data.csv));
        toast(`${r.message} The file is in your downloads.`, "success");
      } else {
        setError(r?.message ?? "The export could not be built. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Exports" description="Download leads, calls or deposits as a spreadsheet file. Each export is recorded below and in the audit log." />

      <Card className="max-w-3xl">
        <form action={run} className="flex flex-col gap-5" noValidate>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label font-medium text-tl-text">What to export</legend>
            <div className="grid gap-2 md:grid-cols-3">
              {EXPORT_KINDS.map((k) => (
                <label
                  key={k.value}
                  className="flex cursor-pointer flex-col gap-1 rounded-control border border-tl-line-strong p-3 has-[:checked]:border-tl-primary has-[:checked]:bg-tl-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-tl-focus"
                >
                  <span className="flex items-center gap-2 text-body font-semibold text-tl-text">
                    <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="size-4 accent-[var(--tl-primary)]" />
                    {k.label}
                  </span>
                  <span className="text-small text-tl-muted">{k.blurb}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-period`} className="text-label font-medium text-tl-text">
                Period
              </label>
              <select id={`${id}-period`} name="period" defaultValue="month" className={control}>
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-team`} className="text-label font-medium text-tl-text">
                Team
              </label>
              <select id={`${id}-team`} name="team" defaultValue="" className={control}>
                <option value="">All teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {canIncludeSensitive && kind === "leads" ? (
            <label className="flex items-start gap-3 rounded-control border border-tl-wait/40 bg-tl-wait/10 p-3 text-body text-tl-text">
              <input type="checkbox" name="sensitive" className="mt-1 size-4 accent-[var(--tl-primary)]" />
              <span>
                Include CNIC and IBAN numbers. Only you can do this, and it is recorded in the audit log. Keep the file private.
              </span>
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="text-body font-medium text-tl-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              <Download aria-hidden className="size-4" />
              {pending ? "Building" : "Export"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-0">
        <CardHeader title="Export history" className="px-5 pt-5" />
        {history.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No exports yet." body="Your exports will be listed here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Export history</caption>
              <thead className="bg-tl-bg">
                <tr>
                  {["When", "Who", "What", "Team", "Rows", "CNIC and IBAN"].map((h) => (
                    <th key={h} scope="col" className="border-y border-tl-line px-5 py-2.5 text-label font-semibold text-tl-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-tl-line first:border-t-0">
                    <td className="px-5 py-2.5 text-body text-tl-text-2">{formatKarachi(h.created_at)}</td>
                    <td className="px-5 py-2.5 text-body text-tl-text-2">{h.who?.full_name ?? "Unknown"}</td>
                    <td className="px-5 py-2.5 text-body font-semibold text-tl-text">{EXPORT_KINDS.find((k) => k.value === h.kind)?.label}</td>
                    <td className="px-5 py-2.5 text-body text-tl-text-2">{teamName(h.filters.team_id)}</td>
                    <td className="tl-amount px-5 py-2.5 text-body text-tl-text-2">{h.row_count}</td>
                    <td className="px-5 py-2.5 text-body text-tl-text-2">{h.includes_sensitive ? "Included" : "Not included"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
