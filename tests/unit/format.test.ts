import { describe, expect, it } from "vitest";
import { formatKarachi, formatPKR, formatPKRCompact, maskTail, normalisePhone } from "@/lib/format";

describe("formatPKR", () => {
  it("formats whole rupees with grouping", () => {
    expect(formatPKR(250000)).toBe("Rs 250,000");
    expect(formatPKR(4250000)).toBe("Rs 4,250,000");
  });

  it("formats zero", () => {
    expect(formatPKR(0)).toBe("Rs 0");
  });

  it("refuses fractional rupees", () => {
    expect(() => formatPKR(10.5)).toThrow(RangeError);
  });

  it("shortens large amounts for phone lists, never rounding up", () => {
    expect(formatPKRCompact(999_999)).toBe("Rs 999,999");
    expect(formatPKRCompact(1_200_000)).toBe("Rs 1.2M");
    expect(formatPKRCompact(1_299_999)).toBe("Rs 1.2M");
  });
});

describe("normalisePhone", () => {
  it.each(["0300 1234567", "03001234567", "+92 300 1234567", "+923001234567", "0092 300 1234567", "300-1234567"])(
    "normalises %s",
    (input) => {
      expect(normalisePhone(input)).toBe("+923001234567");
    },
  );

  it.each(["12345", "", "0300 12345", "+1 415 555 0100", "0300 123456a", "00000000000"])("rejects %s", (input) => {
    expect(normalisePhone(input)).toBeNull();
  });
});

describe("maskTail", () => {
  it("shows only the last 4 digits of a CNIC", () => {
    const masked = maskTail("3520212345671");
    expect(masked.endsWith("5671")).toBe(true);
    expect(masked.replace(/\D/g, "")).toBe("5671");
    expect(masked).not.toContain("35202");
  });

  it("ignores dashes in the input", () => {
    expect(maskTail("35202-1234567-1").replace(/\D/g, "")).toBe("5671");
  });

  it("masks an IBAN to its tail", () => {
    expect(maskTail("PK36SCBL0000001123456702").replace(/[^\dA-Z]/g, "")).toBe("6702");
  });
});

describe("formatKarachi", () => {
  it("shows a UTC instant in Karachi time (UTC+5)", () => {
    expect(formatKarachi("2026-10-08T10:00:00Z")).toBe("8 Oct 2026, 3:00 pm");
    expect(formatKarachi("2026-10-08T21:30:00Z", "date")).toBe("9 Oct 2026");
    expect(formatKarachi(new Date("2026-10-08T04:05:00Z"), "time")).toBe("9:05 am");
  });

  it("rejects an invalid date", () => {
    expect(() => formatKarachi("not a date")).toThrow(RangeError);
  });
});
