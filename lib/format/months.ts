import { KARACHI_TZ } from "./dates";

/** "2026-10-01": first day of the month containing `at`, in Karachi time. */
export function karachiMonthStart(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: KARACHI_TZ, year: "numeric", month: "2-digit" })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-01`;
}

/** Shift a "YYYY-MM-01" month by `n` months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const mon = (total % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}-01`;
}

/** "Oct 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function isMonthStart(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value);
}
