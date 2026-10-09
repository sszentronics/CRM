/**
 * Normalise a Pakistani phone number to "+92XXXXXXXXXX".
 * Accepts local ("0300 1234567"), bare ("3001234567") and international
 * ("+92 300 1234567", "0092...", "92...") forms. Returns null when the input
 * is not a valid 10-digit national number.
 */
export function normalisePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("0092")) digits = digits.slice(4);
  else if (digits.startsWith("92") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);

  if (!/^[1-9]\d{9}$/.test(digits)) return null;
  return `+92${digits}`;
}

/** "+923001234567" -> "0300 1234567" for display. */
export function formatPhone(normalised: string): string {
  const m = /^\+92(\d{3})(\d{7})$/.exec(normalised);
  return m ? `0${m[1]} ${m[2]}` : normalised;
}
