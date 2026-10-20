"use client";

import { Check, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState, useTransition, type DragEvent } from "react";
import { commitImport, previewImport, type ImportPreview } from "@/app/(app)/leads/add/actions";
import { FormMessage } from "@/components/features/auth/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  guessMapping,
  IMPORT_FIELDS,
  mapRows,
  MAX_IMPORT_ROWS,
  parseCsv,
  TEMPLATE_HEADERS,
  toCsv,
  type ColumnMapping,
  type ImportRow,
  type SkippedRow,
} from "@/lib/leads/import";
import type { LeadField } from "@/lib/leads/validate";
import { cn } from "@/lib/utils";

type Sheet = { fileName: string; headers: string[]; body: string[][] };
type Step = 1 | 2 | 3 | 4;
const FIXED = "__fixed__";
const NONE = "";

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function readFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") return parseCsv(await file.text());
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    return data
      .map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))))
      .filter((r) => r.some((c) => c.trim() !== ""));
  }
  throw new Error("Use a .csv or .xlsx file. Older .xls files can be saved as .xlsx from Excel.");
}

function StepBar({ step }: { step: Step }) {
  const steps = ["Upload", "Match columns", "Review"];
  return (
    <ol className="flex items-center gap-3" aria-label="Import steps">
      {steps.map((label, i) => {
        const n = (i + 1) as Step;
        const done = step > n;
        const current = step === n || (step === 4 && n === 3);
        return (
          <li key={label} className="flex items-center gap-3" aria-current={current ? "step" : undefined}>
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-label font-semibold",
                done ? "bg-tl-primary text-white" : current ? "border-2 border-tl-primary text-tl-primary" : "border border-tl-line-strong text-tl-muted",
              )}
            >
              {done ? <Check aria-hidden className="size-4" /> : n}
            </span>
            <span className={cn("text-body font-semibold", current || done ? "text-tl-text" : "text-tl-muted")}>{label}</span>
            {i < steps.length - 1 ? <span aria-hidden className="h-px w-10 bg-tl-line-strong" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone: "primary" | "neutral" | "danger" }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-card border border-l-4 border-tl-line bg-tl-surface p-4",
        tone === "primary" && "border-l-tl-primary",
        tone === "neutral" && "border-l-tl-line-strong",
        tone === "danger" && "border-l-tl-danger",
      )}
    >
      <span className="tl-display tl-amount text-display-m text-tl-text">{n}</span>
      <span className="text-label text-tl-muted">{label}</span>
    </div>
  );
}

export function ImportWizard({ sources }: { sources: string[] }) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fixedSource, setFixedSource] = useState("");
  const [preview, setPreview] = useState<Extract<ImportPreview, { ok: true }> | null>(null);
  const [done, setDone] = useState<{ added: number; skipped: SkippedRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();

  const rows = (): ImportRow[] =>
    sheet ? mapRows(sheet.body, mapping, mapping.source === undefined ? fixedSource || undefined : undefined) : [];

  function reset() {
    setStep(1);
    setSheet(null);
    setMapping({});
    setFixedSource("");
    setPreview(null);
    setDone(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const table = await readFile(file);
      if (table.length < 2) throw new Error("The file has a header but no rows under it.");
      const [headers, ...body] = table;
      if (body.length > MAX_IMPORT_ROWS) {
        throw new Error(`The file has ${body.length.toLocaleString("en-US")} rows. Import up to ${MAX_IMPORT_ROWS.toLocaleString("en-US")} at a time.`);
      }
      const clean = headers.map((h, i) => h.trim() || `Column ${i + 1}`);
      setSheet({ fileName: file.name, headers: clean, body });
      setMapping(guessMapping(clean));
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file could not be read. Check it opens in Excel.");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files?.[0]);
  }

  function setColumn(field: LeadField, value: string) {
    setMapping((m) => {
      const next = { ...m };
      if (value === NONE || value === FIXED) delete next[field];
      else next[field] = Number(value);
      return next;
    });
  }

  const missing = IMPORT_FIELDS.filter(
    (f) => f.required && mapping[f.field] === undefined && !(f.field === "source" && fixedSource),
  );

  function toReview() {
    start(async () => {
      const r = await previewImport(rows());
      if (!r.ok) return setError(r.message);
      setError(null);
      setPreview(r);
      setStep(3);
    });
  }

  function runImport() {
    start(async () => {
      const r = await commitImport(rows(), sheet?.fileName ?? "import");
      if (!r.ok) return setError(r.message);
      setError(null);
      setDone({ added: r.added, skipped: r.skipped });
      setStep(4);
      toast(`${r.added} ${r.added === 1 ? "lead" : "leads"} added to the pool.`, "success");
    });
  }

  function downloadSkipped(skipped: SkippedRow[]) {
    if (!sheet) return;
    const header = ["Row", ...sheet.headers, "Reason"];
    const lines = skipped.map((s) => [String(s.row), ...(sheet.body[s.row - 2] ?? []), s.reason]);
    download(`skipped-${sheet.fileName.replace(/\.[^.]+$/, "")}.csv`, toCsv([header, ...lines]));
  }

  const sample = sheet?.body.slice(0, 3) ?? [];

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <StepBar step={step} />
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {step === 1 ? (
        <Card>
          <CardHeader
            title="Upload a file"
            description="A .csv or .xlsx file with one lead per row and a header row. Up to 2,000 rows."
            actions={
              <Button variant="secondary" onClick={() => download("trading-labs-lead-template.csv", toCsv([TEMPLATE_HEADERS]))}>
                <Download aria-hidden className="size-4" />
                Download template
              </Button>
            }
          />
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragging ? "border-tl-primary bg-tl-primary-soft" : "border-tl-line-strong bg-tl-bg hover:border-tl-primary",
            )}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-tl-primary-soft text-tl-primary">
              <Upload aria-hidden className="size-5" />
            </span>
            <span className="text-body font-semibold text-tl-text">Drop the file here, or click to choose it</span>
            <span className="text-small text-tl-muted">Columns needed: full name, phone and source. City, campaign and notes are optional. Numbers outside Pakistan must start with + and the country code.</span>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label="Choose a lead file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        </Card>
      ) : null}

      {step === 2 && sheet ? (
        <Card>
          <CardHeader
            title="Match the columns"
            description={`${sheet.fileName}: ${sheet.body.length.toLocaleString("en-US")} rows. Tell us which column holds each field.`}
            actions={
              <span className="inline-flex items-center gap-2 text-label text-tl-muted">
                <FileSpreadsheet aria-hidden className="size-4" />
                {sheet.headers.length} columns
              </span>
            }
          />
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            {IMPORT_FIELDS.map((f) => {
              const id = `map-${f.field}`;
              const value =
                mapping[f.field] !== undefined ? String(mapping[f.field]) : f.field === "source" && fixedSource ? FIXED : NONE;
              return (
                <div key={f.field} className="flex flex-col gap-1">
                  <label htmlFor={id} className="text-label font-medium text-tl-text">
                    {f.label}
                    {f.required ? "" : " (optional)"}
                  </label>
                  <select
                    id={id}
                    value={value}
                    onChange={(e) => {
                      setColumn(f.field, e.target.value);
                      if (f.field === "source" && e.target.value !== FIXED) setFixedSource("");
                      if (f.field === "source" && e.target.value === FIXED) setFixedSource(sources[0] ?? "");
                    }}
                    className="h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text"
                  >
                    <option value={NONE}>{f.required ? "Choose a column" : "Not in this file"}</option>
                    {sheet.headers.map((h, i) => (
                      <option key={i} value={String(i)}>
                        {h}
                      </option>
                    ))}
                    {f.field === "source" ? <option value={FIXED}>Same source for every row</option> : null}
                  </select>
                  {f.field === "source" && value === FIXED ? (
                    <select
                      aria-label="Source for every row"
                      value={fixedSource}
                      onChange={(e) => setFixedSource(e.target.value)}
                      className="mt-1 h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text"
                    >
                      {sources.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              );
            })}
          </div>

          {sample.length > 0 ? (
            <div className="mt-6 overflow-x-auto rounded-control border border-tl-line">
              <table className="w-full text-left">
                <caption className="border-b border-tl-line bg-tl-bg px-3 py-2 text-left text-label font-semibold text-tl-muted">
                  First rows, as they will be read
                </caption>
                <thead>
                  <tr className="border-b border-tl-line">
                    {IMPORT_FIELDS.map((f) => (
                      <th key={f.field} scope="col" className="px-3 py-2 text-label font-semibold text-tl-muted">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mapRows(sample, mapping, fixedSource || undefined).map((r) => (
                    <tr key={r.row} className="border-b border-tl-line last:border-b-0">
                      {IMPORT_FIELDS.map((f) => (
                        <td key={f.field} className="max-w-48 truncate px-3 py-2 text-body text-tl-text-2">
                          {r[f.field] || <span className="text-tl-muted">None</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-tl-line pt-5">
            {missing.length > 0 ? (
              <p className="mr-auto text-small text-tl-muted">Choose a column for: {missing.map((m) => m.label).join(", ")}.</p>
            ) : null}
            <Button variant="secondary" onClick={reset}>
              Choose another file
            </Button>
            <Button onClick={toReview} disabled={pending || missing.length > 0}>
              {pending ? "Checking" : "Check the rows"}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 && preview && sheet ? (
        <Card>
          <CardHeader
            title="Review"
            description="Nothing is saved yet. Duplicates and rows with problems are skipped; you can download them after the import."
          />
          <div className="grid gap-3 md:grid-cols-3">
            <Count n={preview.counts.new} label="New leads to add" tone="primary" />
            <Count n={preview.counts.duplicate} label="Duplicates to skip" tone="neutral" />
            <Count n={preview.counts.invalid} label="Rows with problems" tone="danger" />
          </div>
          {preview.skipped.length > 0 ? (
            <div className="mt-5 max-h-80 overflow-auto rounded-control border border-tl-line">
              <table className="w-full text-left">
                <caption className="sr-only">Rows that will be skipped</caption>
                <thead className="sticky top-0 bg-tl-bg">
                  <tr>
                    {["Row", "Name", "Phone", "Why it is skipped"].map((h) => (
                      <th key={h} scope="col" className="border-b border-tl-line px-3 py-2 text-label font-semibold text-tl-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.skipped.map((s) => {
                    const raw = mapRows([sheet.body[s.row - 2] ?? []], mapping)[0];
                    return (
                      <tr key={s.row} className="border-b border-tl-line last:border-b-0">
                        <td className="tl-amount px-3 py-2 text-body text-tl-muted">{s.row}</td>
                        <td className="px-3 py-2 text-body text-tl-text">{raw.full_name || "None"}</td>
                        <td className="tl-amount px-3 py-2 text-body text-tl-text-2">{raw.phone || "None"}</td>
                        <td className={cn("px-3 py-2 text-body", s.kind === "invalid" ? "text-tl-danger" : "text-tl-text-2")}>{s.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="mt-6 flex justify-end gap-2 border-t border-tl-line pt-5">
            <Button variant="secondary" onClick={() => setStep(2)} disabled={pending}>
              Back
            </Button>
            <Button onClick={runImport} disabled={pending || preview.counts.new === 0}>
              {pending
                ? "Importing"
                : `Import ${preview.counts.new.toLocaleString("en-US")} ${preview.counts.new === 1 ? "lead" : "leads"}`}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 4 && done ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tl-primary-soft text-tl-primary">
              <Check aria-hidden className="size-5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-title font-semibold text-tl-text">
                {done.added.toLocaleString("en-US")} {done.added === 1 ? "lead" : "leads"} added to the pool.
              </p>
              <p className="text-body text-tl-muted">
                {done.skipped.length > 0
                  ? `${done.skipped.length} ${done.skipped.length === 1 ? "row was" : "rows were"} skipped. Download them to fix and import again.`
                  : "Every row was imported."}{" "}
                Next, distribute the new leads to teams.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-tl-line pt-5">
            {done.skipped.length > 0 ? (
              <Button variant="secondary" onClick={() => downloadSkipped(done.skipped)}>
                <Download aria-hidden className="size-4" />
                Download {done.skipped.length} skipped {done.skipped.length === 1 ? "row" : "rows"}
              </Button>
            ) : null}
            <Button onClick={reset}>Import another file</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
