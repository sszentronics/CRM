export type CellKind = "text" | "number" | "money" | "percent" | "stage";
export type ReportColumn = { key: string; label: string; kind: CellKind };

export const REPORTS = [
  {
    id: "funnel",
    label: "Funnel",
    blurb: "Leads that moved into each step in the period.",
    chart: { value: "n", label: "step" },
    columns: [
      { key: "step", label: "Step", kind: "text" },
      { key: "n", label: "Leads", kind: "number" },
    ],
  },
  {
    id: "sources",
    label: "Source performance",
    blurb: "Which lead sources bring calls, funded clients and verified money.",
    chart: { value: "verified_pkr", label: "source" },
    columns: [
      { key: "source", label: "Source", kind: "text" },
      { key: "leads", label: "Leads added", kind: "number" },
      { key: "contacted", label: "Called", kind: "number" },
      { key: "funded", label: "Funded clients", kind: "number" },
      { key: "verified_pkr", label: "Verified", kind: "money" },
    ],
  },
  {
    id: "agents",
    label: "Agent activity",
    blurb: "Calls, interested clients and verified money for each agent.",
    chart: { value: "verified_pkr", label: "name" },
    columns: [
      { key: "name", label: "Agent", kind: "text" },
      { key: "team", label: "Team", kind: "text" },
      { key: "calls", label: "Calls", kind: "number" },
      { key: "interested", label: "Interested", kind: "number" },
      { key: "deposits", label: "Deposits", kind: "number" },
      { key: "verified_pkr", label: "Verified", kind: "money" },
      { key: "overdue", label: "Overdue now", kind: "number" },
    ],
  },
  {
    id: "deposits",
    label: "Deposits",
    blurb: "Verified deposits by team. Matches the boards for the same period.",
    chart: { value: "verified_pkr", label: "team" },
    columns: [
      { key: "team", label: "Team", kind: "text" },
      { key: "deposits", label: "Deposits", kind: "number" },
      { key: "first", label: "First", kind: "number" },
      { key: "top_ups", label: "Top-ups", kind: "number" },
      { key: "verified_pkr", label: "Verified", kind: "money" },
      { key: "average_pkr", label: "Average", kind: "money" },
    ],
  },
  {
    id: "analysts",
    label: "Analyst sessions",
    blurb: "Referrals, sessions held and the money credited to each analyst.",
    chart: { value: "verified_pkr", label: "name" },
    columns: [
      { key: "name", label: "Analyst", kind: "text" },
      { key: "referrals", label: "Referrals", kind: "number" },
      { key: "sessions", label: "Sessions held", kind: "number" },
      { key: "no_shows", label: "No-shows", kind: "number" },
      { key: "funded", label: "Funded clients", kind: "number" },
      { key: "verified_pkr", label: "Credited", kind: "money" },
    ],
  },
  {
    id: "aging",
    label: "Aging",
    blurb: "Open leads by stage and how long since their last activity.",
    chart: { value: "total", label: "stage" },
    columns: [
      { key: "stage", label: "Stage", kind: "stage" },
      { key: "under_1_day", label: "Under 1 day", kind: "number" },
      { key: "days_1_to_3", label: "1 to 3 days", kind: "number" },
      { key: "days_3_to_7", label: "3 to 7 days", kind: "number" },
      { key: "over_7_days", label: "Over 7 days", kind: "number" },
      { key: "total", label: "Total", kind: "number" },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    blurb: "How many leads from each source turn out invalid or not interested.",
    chart: { value: "invalid_pct", label: "source" },
    columns: [
      { key: "source", label: "Source", kind: "text" },
      { key: "leads", label: "Leads added", kind: "number" },
      { key: "invalid", label: "Invalid", kind: "number" },
      { key: "not_interested", label: "Not interested", kind: "number" },
      { key: "invalid_pct", label: "Invalid share", kind: "percent" },
    ],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  blurb: string;
  chart: { value: string; label: string };
  columns: readonly ReportColumn[];
}[];

export type ReportId = (typeof REPORTS)[number]["id"];
export const isReportId = (v: unknown): v is ReportId => REPORTS.some((r) => r.id === v);
