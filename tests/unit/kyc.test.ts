import { describe, expect, it } from "vitest";
import { formatCnic, formatIban, kycFormSchema, missingFields, normaliseCnic, normaliseIban, type KycValues } from "@/lib/kyc/fields";
import { maskTail } from "@/lib/format/mask";

describe("CNIC", () => {
  it("accepts 13 digits with or without dashes", () => {
    expect(normaliseCnic("35202-1234567-1")).toBe("3520212345671");
    expect(normaliseCnic("3520212345671")).toBe("3520212345671");
    expect(normaliseCnic(" 35202 1234567 1 ")).toBe("3520212345671");
  });

  it("rejects wrong lengths and letters", () => {
    expect(normaliseCnic("352021234567")).toBeNull();
    expect(normaliseCnic("35202123456712")).toBeNull();
    expect(normaliseCnic("35202-12345A7-1")).toBeNull();
    expect(normaliseCnic("")).toBeNull();
  });

  it("formats and masks", () => {
    expect(formatCnic("3520212345671")).toBe("35202-1234567-1");
    expect(maskTail("3520212345671")).toBe("•••• 5671");
  });
});

describe("IBAN", () => {
  it("accepts a 24-character PK IBAN, with spaces or lower case", () => {
    expect(normaliseIban("PK36SCBL0000001123456702")).toBe("PK36SCBL0000001123456702");
    expect(normaliseIban("pk36 scbl 0000 0011 2345 6702")).toBe("PK36SCBL0000001123456702");
  });

  it("rejects wrong lengths and wrong prefixes", () => {
    expect(normaliseIban("PK36SCBL000000112345670")).toBeNull();
    expect(normaliseIban("PK36SCBL00000011234567023")).toBeNull();
    expect(normaliseIban("GB36SCBL0000001123456702")).toBeNull();
    expect(normaliseIban("PKXXSCBL0000001123456702")).toBeNull();
  });

  it("formats in groups of four", () => {
    expect(formatIban("PK36SCBL0000001123456702")).toBe("PK36 SCBL 0000 0011 2345 6702");
  });
});

describe("KYC form", () => {
  const schema = kycFormSchema("2026-10-08");

  it("saves partial details and normalises what is entered", () => {
    const r = schema.parse({ cnic_number: "35202-1234567-1", iban: "pk36 scbl 0000 0011 2345 6702", sim_in_own_name: "yes" });
    expect(r).toMatchObject({ cnic_number: "3520212345671", iban: "PK36SCBL0000001123456702", sim_in_own_name: true, mother_name: null });
  });

  it("refuses an expired CNIC and says what to do", () => {
    const r = schema.safeParse({ cnic_expiry: "2026-01-01" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain("expired");
  });

  it("lists the fields still missing", () => {
    const empty: KycValues = {
      cnic_number: null, cnic_expiry: null, mother_name: null, email: null, bank_name: null, iban: null,
      income_band: null, sim_in_own_name: null, consent_at: null, risk_level: null, is_pep: null,
    };
    expect(missingFields(empty)).toHaveLength(11);
    expect(missingFields({ ...empty, sim_in_own_name: false, is_pep: false })).not.toContain("sim_in_own_name");
  });
});
