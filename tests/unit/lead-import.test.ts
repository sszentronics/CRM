import { describe, expect, it } from "vitest";
import { normalisePhone, PHONE_HELP } from "@/lib/format/phone";
import {
  candidatePhones,
  classifyImportRows,
  guessMapping,
  mapRows,
  parseCsv,
  toCsv,
} from "@/lib/leads/import";
import { validateLead } from "@/lib/leads/validate";

const SOURCES = ["Facebook", "Instagram", "TikTok", "PR", "Referral", "Walk-in"];

// 10 rows: 7 new, 2 duplicates (one repeats a row above, one is already in the system), 1 bad phone.
const FILE = `Full name,Phone,Source,City
Ahmed Khan,0300 1111111,Facebook,Lahore
Sana Tariq,03002222222,instagram,Karachi
Bilal Raza,+92 300 3333333,TikTok,Islamabad
Hira Malik,0300-4444444,PR,
Usman Ali,0300 5555555,Referral,Rawalpindi
Zara Noor,0300 6666666,Walk-in,Multan
"Khan, Imran",0300 7777777,Facebook,Peshawar
Ahmed K. again,0300 1111111,Facebook,Lahore
Old Lead,0300 9999999,Instagram,Quetta
Bad Number,12345,Facebook,Lahore
`;

describe("lead import", () => {
  it("reports 7 new, 2 duplicate and 1 invalid for the 10-row file", () => {
    const table = parseCsv(FILE);
    const [header, ...body] = table;
    expect(body).toHaveLength(10);
    const rows = mapRows(body, guessMapping(header));
    const existing = new Set(["+923009999999"]);
    const result = classifyImportRows(rows, existing, SOURCES);
    expect(result.counts).toEqual({ new: 7, duplicate: 2, invalid: 1 });
  });

  it("says why each skipped row was skipped, with its sheet row number", () => {
    const [header, ...body] = parseCsv(FILE);
    const result = classifyImportRows(mapRows(body, guessMapping(header)), new Set(["+923009999999"]), SOURCES);
    expect(result.skipped).toEqual([
      { row: 9, kind: "duplicate", reason: "That number appears earlier in this file." },
      { row: 10, kind: "duplicate", reason: "That number is already in the system." },
      { row: 11, kind: "invalid", reason: PHONE_HELP },
    ]);
  });

  it("normalises phones and uses the setting's spelling of the source", () => {
    const [header, ...body] = parseCsv(FILE);
    const { fresh } = classifyImportRows(mapRows(body, guessMapping(header)), new Set(), SOURCES);
    expect(fresh[1]).toMatchObject({ full_name: "Sana Tariq", phone: "+923002222222", source: "Instagram" });
    expect(fresh[6].full_name).toBe("Khan, Imran");
  });

  it("guesses columns from common header names", () => {
    expect(guessMapping(["Customer Name", "Mobile Number", "Platform", "Town"])).toEqual({
      full_name: 0,
      phone: 1,
      source: 2,
      city: 3,
    });
  });

  it("uses one source for every row when no column holds it", () => {
    const rows = mapRows([["Ali", "0300 1234567"]], { full_name: 0, phone: 1 }, "PR");
    expect(rows[0].source).toBe("PR");
  });

  it("collects each distinct normalised phone once", () => {
    const [header, ...body] = parseCsv(FILE);
    const phones = candidatePhones(mapRows(body, guessMapping(header)), normalisePhone);
    expect(phones).toHaveLength(8);
  });
});

describe("CSV", () => {
  it("reads quotes, doubled quotes, line breaks in quotes and a BOM", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi""","line\nbreak"\r\n1,2,3,4\r\n')).toEqual([
      ["a", "b, c", 'say "hi"', "line\nbreak"],
      ["1", "2", "3", "4"],
    ]);
  });

  it("round-trips through toCsv and defuses spreadsheet formulas", () => {
    const out = toCsv([["Name", "Reason"], ["=HYPERLINK(1)", 'says "no", twice']]);
    expect(parseCsv(out)).toEqual([
      ["Name", "Reason"],
      ["'=HYPERLINK(1)", 'says "no", twice'],
    ]);
  });
});

describe("validateLead", () => {
  it("requires name, phone and source", () => {
    const r = validateLead({}, SOURCES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["full_name", "phone", "source"]);
  });

  it("refuses a source that is not in the settings, naming the allowed ones", () => {
    const r = validateLead({ full_name: "Ali", phone: "0300 1234567", source: "Billboard" }, SOURCES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.source).toContain("Use one of: Facebook");
  });
});
