import { z } from "zod";

/** CNIC: 13 digits. Accepts "35202-1234567-1" or "3520212345671"; returns the 13 digits or null. */
export function normaliseCnic(input: string): string | null {
  const trimmed = input.trim();
  if (!/^[\d\s-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/[\s-]/g, "");
  return /^\d{13}$/.test(digits) ? digits : null;
}

/** "3520212345671" -> "35202-1234567-1". */
export function formatCnic(cnic: string): string {
  return /^\d{13}$/.test(cnic) ? `${cnic.slice(0, 5)}-${cnic.slice(5, 12)}-${cnic.slice(12)}` : cnic;
}

/** Pakistani IBAN: 24 characters, PK, 2 check digits, 4-letter bank code, 16 account characters. */
export function normaliseIban(input: string): string | null {
  const v = input.replace(/\s/g, "").toUpperCase();
  return /^PK\d{2}[A-Z]{4}[0-9A-Z]{16}$/.test(v) ? v : null;
}

/** "PK36SCBL0000001123456702" -> "PK36 SCBL 0000 0011 2345 6702". */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

export const INCOME_BANDS = [
  { value: "under_50k", label: "Under Rs 50,000 a month" },
  { value: "50k_150k", label: "Rs 50,000 to 150,000 a month" },
  { value: "150k_500k", label: "Rs 150,000 to 500,000 a month" },
  { value: "over_500k", label: "Over Rs 500,000 a month" },
] as const;

export const RISK_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export const KYC_FIELD_LABELS = {
  cnic_number: "CNIC number",
  cnic_expiry: "CNIC expiry",
  mother_name: "Mother's name",
  email: "Email",
  bank_name: "Bank",
  iban: "IBAN",
  income_band: "Monthly income",
  sim_in_own_name: "SIM in the client's own name",
  consent_at: "Client consent",
  risk_level: "Risk level",
  is_pep: "Politically exposed person",
} as const;
export type KycField = keyof typeof KYC_FIELD_LABELS;

export type KycValues = {
  cnic_number: string | null;
  cnic_expiry: string | null;
  mother_name: string | null;
  email: string | null;
  bank_name: string | null;
  iban: string | null;
  income_band: string | null;
  sim_in_own_name: boolean | null;
  consent_at: string | null;
  risk_level: string | null;
  is_pep: boolean | null;
};

/** Fields still empty (mirrors private.kyc_fields_complete). */
export function missingFields(k: KycValues): KycField[] {
  return (Object.keys(KYC_FIELD_LABELS) as KycField[]).filter((f) => k[f] === null || k[f] === "");
}

const optionalText = (max: number, message: string) =>
  z
    .string()
    .optional()
    .transform((v) => v?.trim() || null)
    .refine((v) => v === null || v.length <= max, message);

const yesNo = z
  .enum(["yes", "no", ""])
  .optional()
  .transform((v) => (v === "yes" ? true : v === "no" ? false : null));

/**
 * The KYC form. Every field may be saved empty (agents fill it in over several calls);
 * anything entered must be valid. Completeness is checked separately.
 */
export function kycFormSchema(today: string) {
  return z.object({
    cnic_number: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (!v?.trim()) return null;
        const n = normaliseCnic(v);
        if (!n) {
          ctx.addIssue({ code: "custom", message: "A CNIC has 13 digits, for example 35202-1234567-1." });
          return z.NEVER;
        }
        return n;
      }),
    cnic_expiry: z
      .string()
      .optional()
      .transform((v) => v?.trim() || null)
      .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter the expiry date.")
      .refine((v) => v === null || v >= today, "This CNIC has expired. Ask the client for a valid one."),
    mother_name: optionalText(80, "Keep the name under 80 characters."),
    email: z
      .string()
      .optional()
      .transform((v) => v?.trim().toLowerCase() || null)
      .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address."),
    bank_name: optionalText(80, "Keep the bank name under 80 characters."),
    iban: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (!v?.trim()) return null;
        const n = normaliseIban(v);
        if (!n) {
          ctx.addIssue({ code: "custom", message: "A Pakistani IBAN has 24 characters and starts with PK." });
          return z.NEVER;
        }
        return n;
      }),
    income_band: z
      .string()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || INCOME_BANDS.some((b) => b.value === v), "Choose an income band."),
    sim_in_own_name: yesNo,
    consent: z
      .string()
      .optional()
      .transform((v) => v === "on" || v === "true"),
    risk_level: z
      .string()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || RISK_LEVELS.some((r) => r.value === v), "Choose a risk level."),
    is_pep: yesNo,
  });
}
