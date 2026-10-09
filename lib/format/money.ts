const grouping = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function assertWholeRupees(amount: number) {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Money must be whole rupees, got ${amount}`);
  }
}

/** Whole rupees to display text: 250000 -> "Rs 250,000". */
export function formatPKR(amount: number): string {
  assertWholeRupees(amount);
  const sign = amount < 0 ? "-" : "";
  return `${sign}Rs ${grouping.format(Math.abs(amount))}`;
}

/**
 * Short form for phone lists (DESIGN.md section 8): amounts above Rs 999,999
 * become one decimal with M, e.g. "Rs 1.2M". Rounds down so it never overstates.
 */
export function formatPKRCompact(amount: number): string {
  assertWholeRupees(amount);
  if (Math.abs(amount) <= 999_999) return formatPKR(amount);
  const sign = amount < 0 ? "-" : "";
  const tenths = Math.floor(Math.abs(amount) / 100_000);
  return `${sign}Rs ${(tenths / 10).toFixed(1)}M`;
}

/** Read a typed rupee amount ("250,000", "Rs 250000"). Returns null unless it is a whole, non-negative number. */
export function parsePKR(text: string): number | null {
  const clean = text.replace(/^\s*rs\.?\s*/i, "").replace(/[,\s]/g, "");
  if (!/^\d{1,12}$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isSafeInteger(n) ? n : null;
}
