import { z } from "zod";

export const DEPOSIT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "online", label: "Online or app transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
] as const;

export type DepositMethod = (typeof DEPOSIT_METHODS)[number]["value"];
export type DepositType = "first" | "top_up";
export type DepositStatus = "pending" | "verified" | "rejected" | "reversed";

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  pending: "Waiting for review",
  verified: "Verified",
  rejected: "Rejected",
  reversed: "Reversed",
};

export const DEPOSIT_TYPE_LABEL: Record<DepositType, string> = { first: "First deposit", top_up: "Top-up" };

export const METHOD_LABEL: Record<string, string> = Object.fromEntries(DEPOSIT_METHODS.map((m) => [m.value, m.label]));

/** The type is decided by the system: a client with no pending or verified deposit gets "first". */
export function depositType(existing: readonly { status: DepositStatus }[]): DepositType {
  return existing.some((d) => d.status === "pending" || d.status === "verified") ? "top_up" : "first";
}

/** Cash above the limit is flagged for the Admin. Other methods never are. */
export function isCashFlagged(method: DepositMethod, amountPkr: number, limitPkr: number) {
  return method === "cash" && amountPkr > limitPkr;
}

/** A reference is compared without case or spaces around it. */
export const normaliseReference = (ref: string) => ref.trim().toLowerCase();

export function isReferenceUsed(ref: string, used: readonly string[]) {
  const wanted = normaliseReference(ref);
  return used.some((u) => normaliseReference(u) === wanted);
}

/** A reason is needed to reject or reverse; keep it short enough to read in a notification. */
export const reasonSchema = z
  .string()
  .trim()
  .min(3, "Give a short reason.")
  .max(300, "Keep the reason under 300 characters.");

/** The add-deposit form. `today` is the Karachi calendar date (YYYY-MM-DD). */
export function depositFormSchema(today: string) {
  return z.object({
    amount: z
      .string()
      .trim()
      .min(1, "Enter the amount in rupees.")
      .transform((v) => Number(v.replace(/[^0-9]/g, "")))
      .pipe(z.number().int("Use whole rupees.").min(1, "Enter the amount in rupees.").max(1_000_000_000, "That amount is too large.")),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the deposit date.")
      .refine((d) => d <= today, "The deposit date cannot be in the future."),
    method: z.enum(DEPOSIT_METHODS.map((m) => m.value) as [DepositMethod, ...DepositMethod[]], "Choose how it was paid."),
    reference: z
      .string()
      .trim()
      .min(4, "Enter the bank or transaction reference number.")
      .max(60, "That reference is too long."),
  });
}
