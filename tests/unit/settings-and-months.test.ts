import { describe, expect, it } from "vitest";
import { parsePKR } from "@/lib/format/money";
import { addMonths, formatMonth, isMonthStart, karachiMonthStart } from "@/lib/format/months";
import { brokerSchema } from "@/lib/brokers/schemas";
import { parseSetting, settingSchema, SETTINGS } from "@/lib/settings/definitions";

describe("settings definitions", () => {
  it("parses stored values and falls back to the default when a row is broken", () => {
    expect(parseSetting("max_call_tries", 7)).toBe(7);
    expect(parseSetting("max_call_tries", "not a number")).toBe(5);
    expect(parseSetting("max_call_tries", undefined)).toBe(5);
    expect(parseSetting("lead_sources", null)).toEqual(SETTINGS.lead_sources.default);
  });

  it("enforces the limits with a message that says how to fix it", () => {
    const r = settingSchema("max_call_tries").safeParse(0);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Enter a whole number from 1 to 20.");
    expect(settingSchema("max_call_tries").safeParse(2.5).success).toBe(false);
  });

  it("rejects empty and repeated list items", () => {
    expect(settingSchema("lead_sources").safeParse([]).success).toBe(false);
    expect(settingSchema("lead_sources").safeParse(["PR", "pr"]).success).toBe(false);
    expect(settingSchema("lead_sources").safeParse(["PR", "Referral"]).success).toBe(true);
  });
});

describe("months", () => {
  it("uses Karachi time for the current month", () => {
    // 20:00 UTC on 31 Oct is 01:00 on 1 Nov in Karachi.
    expect(karachiMonthStart(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11-01");
    expect(karachiMonthStart(new Date("2026-10-31T18:00:00Z"))).toBe("2026-10-01");
  });

  it("moves across year ends", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(formatMonth("2026-10-01")).toBe("Oct 2026");
    expect(isMonthStart("2026-10-15")).toBe(false);
  });
});

describe("parsePKR", () => {
  it("reads typed amounts and refuses anything that is not whole rupees", () => {
    expect(parsePKR("2,500,000")).toBe(2_500_000);
    expect(parsePKR("Rs 250000")).toBe(250_000);
    expect(parsePKR("12.5")).toBeNull();
    expect(parsePKR("-5")).toBeNull();
    expect(parsePKR("")).toBeNull();
  });
});

describe("brokerSchema", () => {
  it("needs at least one checklist item and keeps the standard order", () => {
    expect(brokerSchema.safeParse({ name: "Topline", market: "psx", checklist: [] }).success).toBe(false);
    const r = brokerSchema.parse({ name: "Topline", market: "psx", checklist: ["cnic_back", "cnic_front"] });
    expect(r.checklist).toEqual(["cnic_front", "cnic_back"]);
  });

  it("refuses unknown document types and markets", () => {
    expect(brokerSchema.safeParse({ name: "X Ltd", market: "nyse", checklist: ["cnic_front"] }).success).toBe(false);
    expect(brokerSchema.safeParse({ name: "X Ltd", market: "psx", checklist: ["passport"] }).success).toBe(false);
  });
});
