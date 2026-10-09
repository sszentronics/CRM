import { validateLead, type CleanLead, type LeadField, type RawLead } from "./validate";

/** Most rows one import may hold. 200 a month is normal; this leaves room for a backlog. */
export const MAX_IMPORT_ROWS = 2000;

export const IMPORT_FIELDS: { field: LeadField; label: string; required: boolean; hints: string[] }[] = [
  { field: "full_name", label: "Full name", required: true, hints: ["full name", "name", "client", "customer", "lead"] },
  { field: "phone", label: "Phone", required: true, hints: ["phone", "mobile", "number", "contact", "cell", "whatsapp"] },
  { field: "source", label: "Source", required: true, hints: ["source", "platform", "channel"] },
  { field: "city", label: "City", required: false, hints: ["city", "town", "location"] },
  { field: "campaign", label: "Campaign", required: false, hints: ["campaign", "ad", "advert"] },
  { field: "notes", label: "Notes", required: false, hints: ["notes", "note", "comment", "remarks"] },
];

/** Header row of the downloadable template. */
export const TEMPLATE_HEADERS = ["Full name", "Phone", "Source", "City", "Campaign", "Notes"];

/** One row from the file, with its line number in the sheet (header is row 1). */
export type ImportRow = RawLead & { row: number };

export type SkipReason = "invalid" | "duplicate";
export type SkippedRow = { row: number; kind: SkipReason; reason: string };

export type ImportClassification = {
  fresh: (CleanLead & { row: number })[];
  skipped: SkippedRow[];
  counts: { new: number; duplicate: number; invalid: number };
};

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Quote a value for CSV, and defuse spreadsheet formulas (=, +, -, @) so a downloaded file cannot run them. */
function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Column matching
// ---------------------------------------------------------------------------

export type ColumnMapping = Partial<Record<LeadField, number>>;

/** Guess which column holds each field from the header names. The person confirms it in step 2. */
export function guessMapping(headers: string[]): ColumnMapping {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z]+/g, " ").trim());
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  for (const f of IMPORT_FIELDS) {
    const idx = norm.findIndex((h, i) => !used.has(i) && f.hints.some((hint) => h === hint || h.includes(hint)));
    if (idx >= 0) {
      mapping[f.field] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

/** Turn sheet rows into import rows using the mapping. `fixedSource` fills Source when no column holds it. */
export function mapRows(body: string[][], mapping: ColumnMapping, fixedSource?: string): ImportRow[] {
  return body.map((cells, i) => {
    const pick = (f: LeadField) => {
      const idx = mapping[f];
      return idx === undefined ? undefined : (cells[idx] ?? "").toString();
    };
    return {
      row: i + 2,
      full_name: pick("full_name"),
      phone: pick("phone"),
      source: mapping.source === undefined ? fixedSource : pick("source"),
      city: pick("city"),
      campaign: pick("campaign"),
      notes: pick("notes"),
    };
  });
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Sort rows into new, duplicate and invalid. A row is a duplicate when its
 * normalised phone is already in the system or appears earlier in the file.
 */
export function classifyImportRows(
  rows: ImportRow[],
  existingPhones: ReadonlySet<string>,
  sources: readonly string[],
): ImportClassification {
  const fresh: ImportClassification["fresh"] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const v = validateLead(r, sources);
    if (!v.ok) {
      skipped.push({ row: r.row, kind: "invalid", reason: Object.values(v.errors).join(" ") });
      continue;
    }
    if (existingPhones.has(v.lead.phone)) {
      skipped.push({ row: r.row, kind: "duplicate", reason: "That number is already in the system." });
      continue;
    }
    if (seen.has(v.lead.phone)) {
      skipped.push({ row: r.row, kind: "duplicate", reason: "That number appears earlier in this file." });
      continue;
    }
    seen.add(v.lead.phone);
    fresh.push({ ...v.lead, row: r.row });
  }

  return {
    fresh,
    skipped,
    counts: {
      new: fresh.length,
      duplicate: skipped.filter((s) => s.kind === "duplicate").length,
      invalid: skipped.filter((s) => s.kind === "invalid").length,
    },
  };
}

/** Normalised phones in the rows, for one existence query against the database. */
export function candidatePhones(rows: ImportRow[], normalise: (p: string) => string | null): string[] {
  return [...new Set(rows.map((r) => (r.phone ? normalise(r.phone) : null)).filter((p): p is string => !!p))];
}
