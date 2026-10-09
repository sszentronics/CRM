import { describe, expect, it } from "vitest";
import { depositFormSchema, depositType, isCashFlagged, isReferenceUsed, reasonSchema } from "@/lib/deposits/rules";

describe("deposit type", () => {
  it("is first for the first deposit and top_up for the next", () => {
    expect(depositType([])).toBe("first");
    expect(depositType([{ status: "verified" }])).toBe("top_up");
    expect(depositType([{ status: "pending" }])).toBe("top_up");
  });
  it("is first again when earlier deposits were rejected or reversed", () => {
    expect(depositType([{ status: "rejected" }, { status: "reversed" }])).toBe("first");
  });
});

describe("deposit form", () => {
  const schema = depositFormSchema("2026-10-08");
  const good = { amount: "250,000", date: "2026-10-08", method: "bank_transfer", reference: "TXN-123456" };

  it("accepts a good deposit and reads the amount as whole rupees", () => {
    const r = schema.safeParse(good);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(250000);
  });
  it("rejects a future date", () => {
    const r = schema.safeParse({ ...good, date: "2026-10-09" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("The deposit date cannot be in the future.");
  });
  it("rejects a missing reference (there is no proof file)", () => {
    expect(schema.safeParse({ ...good, reference: "  " }).success).toBe(false);
    expect(schema.safeParse({ ...good, reference: "abc" }).success).toBe(false);
  });
  it("rejects a missing amount and an unknown method", () => {
    expect(schema.safeParse({ ...good, amount: "" }).success).toBe(false);
    expect(schema.safeParse({ ...good, amount: "0" }).success).toBe(false);
    expect(schema.safeParse({ ...good, method: "bitcoin" }).success).toBe(false);
  });
  it("rejects a repeated reference, ignoring case and spaces", () => {
    expect(isReferenceUsed(" txn-123456 ", ["TXN-123456"])).toBe(true);
    expect(isReferenceUsed("TXN-999999", ["TXN-123456"])).toBe(false);
  });
});

describe("cash flag", () => {
  it("flags Rs 30,000 by cash when the limit is Rs 25,000", () => {
    expect(isCashFlagged("cash", 30000, 25000)).toBe(true);
  });
  it("does not flag Rs 30,000 by bank transfer, or Rs 25,000 by cash", () => {
    expect(isCashFlagged("bank_transfer", 30000, 25000)).toBe(false);
    expect(isCashFlagged("cash", 25000, 25000)).toBe(false);
  });
});

describe("reasons", () => {
  it("need a few characters", () => {
    expect(reasonSchema.safeParse("").success).toBe(false);
    expect(reasonSchema.safeParse("Amount does not match").success).toBe(true);
  });
});
