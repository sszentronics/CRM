import { describe, expect, it } from "vitest";
import { buildCsv, exportColumns } from "@/lib/exports/columns";
import { parseReportFilters } from "@/lib/reports/params";

describe("export columns", () => {
  it("leave CNIC and IBAN out unless the Superadmin asks", () => {
    const admin = exportColumns("leads", false).map((c) => c.label);
    expect(admin).not.toContain("CNIC");
    expect(admin).not.toContain("IBAN");
    const owner = exportColumns("leads", true).map((c) => c.label);
    expect(owner).toContain("CNIC");
    expect(owner).toContain("IBAN");
  });
  it("never carry KYC fields in calls or deposits", () => {
    for (const kind of ["calls", "deposits"] as const) {
      expect(exportColumns(kind, true).some((c) => c.sensitive)).toBe(false);
    }
  });
});

describe("csv", () => {
  it("writes the header, leaves out a value an Admin was not given, and defuses formulas", () => {
    const rows = [{ name: '=HYPERLINK("x")', phone: "+923001234567", cnic: "3520212345671", iban: "PK36", stage: "follow_up" }];
    const csv = buildCsv("leads", rows, false);
    expect(csv.split("\r\n")[0]).toBe("Name,Phone,City,Source,Campaign,Stage,Team,Agent,Added,Last activity");
    expect(csv).not.toContain("3520212345671");
    expect(csv).toContain("'=HYPERLINK");
  });
  it("includes the sensitive columns for the Superadmin", () => {
    const csv = buildCsv("leads", [{ name: "A", cnic: "3520212345671", iban: "PK36" }], true);
    expect(csv).toContain("3520212345671");
  });
});

describe("report filters", () => {
  it("ignore anything that is not a period or a uuid", () => {
    expect(parseReportFilters({ period: "decade", team: "x; drop", broker: "nope" })).toEqual({ period: "month", team: null, broker: null });
    const id = "11111111-2222-4333-8444-555555555555";
    expect(parseReportFilters({ period: "week", team: id })).toEqual({ period: "week", team: id, broker: null });
  });
});
