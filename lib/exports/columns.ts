import { toCsv } from "@/lib/leads/import";

export type ExportKind = "leads" | "calls" | "deposits";

export const EXPORT_KINDS: { value: ExportKind; label: string; blurb: string }[] = [
  { value: "leads", label: "Leads", blurb: "Every lead added in the period, with its team, agent and stage." },
  { value: "calls", label: "Calls", blurb: "Every logged call in the period, with its outcome." },
  { value: "deposits", label: "Deposits", blurb: "Every deposit recorded in the period, whatever its status." },
];

export const isExportKind = (v: unknown): v is ExportKind => EXPORT_KINDS.some((k) => k.value === v);

type Col = { key: string; label: string; sensitive?: boolean };

export const EXPORT_COLUMNS: Record<ExportKind, Col[]> = {
  leads: [
    { key: "name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "city", label: "City" },
    { key: "source", label: "Source" },
    { key: "campaign", label: "Campaign" },
    { key: "stage", label: "Stage" },
    { key: "team", label: "Team" },
    { key: "agent", label: "Agent" },
    { key: "created_at", label: "Added" },
    { key: "last_activity_at", label: "Last activity" },
    { key: "cnic", label: "CNIC", sensitive: true },
    { key: "iban", label: "IBAN", sensitive: true },
  ],
  calls: [
    { key: "created_at", label: "Time" },
    { key: "agent", label: "Agent" },
    { key: "team", label: "Team" },
    { key: "lead", label: "Lead" },
    { key: "phone", label: "Phone" },
    { key: "outcome", label: "Outcome" },
    { key: "from_stage", label: "From stage" },
    { key: "to_stage", label: "To stage" },
  ],
  deposits: [
    { key: "created_at", label: "Recorded" },
    { key: "deposit_date", label: "Deposit date" },
    { key: "reference", label: "Reference" },
    { key: "client", label: "Client" },
    { key: "amount_pkr", label: "Amount (Rs)" },
    { key: "type", label: "Type" },
    { key: "method", label: "Method" },
    { key: "status", label: "Status" },
    { key: "team", label: "Team" },
    { key: "agent", label: "Agent" },
    { key: "broker", label: "Broker" },
    { key: "verified_at", label: "Verified" },
  ],
};

/** The columns an export carries. CNIC and IBAN only when the Superadmin asks for them. */
export function exportColumns(kind: ExportKind, includeSensitive: boolean) {
  return EXPORT_COLUMNS[kind].filter((c) => includeSensitive || !c.sensitive);
}

/** A spreadsheet-safe CSV. Cells that begin like a formula are defused by toCsv. */
export function buildCsv(kind: ExportKind, rows: Record<string, unknown>[], includeSensitive: boolean): string {
  const cols = exportColumns(kind, includeSensitive);
  return toCsv([
    cols.map((c) => c.label),
    ...rows.map((r) => cols.map((c) => (r[c.key] === null || r[c.key] === undefined ? "" : String(r[c.key])))),
  ]);
}
