/** Shown under a phone field when the number cannot be read. */
export const PHONE_HELP =
  "Enter a full phone number. Pakistani numbers look like 0300 1234567. For any other country start with + and the country code, like +1 415 555 0100.";

/**
 * Normalise a phone number to E.164, "+" then 8 to 15 digits.
 *
 * - With "+" or "00" the number is international and is kept as typed
 *   ("+1 415 555 0100", "0044 7911 123456").
 * - With no prefix it is read as Pakistani: "0300 1234567", "300-1234567",
 *   "92 300 1234567", and landlines such as "051 2220003" (0, then 9 or 10 digits).
 *
 * Returns null when the input cannot be a phone number. Only the shape is checked;
 * we do not claim a foreign number is reachable.
 */
export function normalisePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    // Already international.
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    // Pakistani national form: 0, then mobile (10 digits) or landline (9 or 10 digits).
    const rest = digits.slice(1);
    if (!/^[1-9]\d{8,9}$/.test(rest)) return null;
    digits = `92${rest}`;
  } else if (/^[1-9]\d{9}$/.test(digits)) {
    digits = `92${digits}`;
  } else if (!/^92[1-9]\d{8,9}$/.test(digits)) {
    // No "+" and not a Pakistani shape: too ambiguous to guess a country.
    return null;
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  // Pakistan has a fixed length, so a "+92" number with the wrong length is a typo.
  if (digits.startsWith("92") && !/^92[1-9]\d{8,9}$/.test(digits)) return null;
  return `+${digits}`;
}

const ONE_DIGIT_CODES = new Set(["1", "7"]);
const TWO_DIGIT_CODES = new Set(
  "20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98".split(" "),
);

/** Length of the country code at the front of a digit string. */
function countryCodeLength(digits: string): number {
  if (ONE_DIGIT_CODES.has(digits[0])) return 1;
  if (TWO_DIGIT_CODES.has(digits.slice(0, 2))) return 2;
  return 3;
}

/** "4155550100" -> "415 555 0100": groups of 3, the last group 3 or 4 digits. */
function groupDigits(digits: string): string {
  const groups: string[] = [];
  let rest = digits;
  while (rest.length > 4) {
    groups.push(rest.slice(0, 3));
    rest = rest.slice(3);
  }
  groups.push(rest);
  return groups.join(" ");
}

/**
 * "+923001234567" -> "0300 1234567"; "+14155550100" -> "+1 415 555 0100".
 * Pakistani landlines show as "0512220003". Anything unreadable is returned as it is.
 */
export function formatPhone(normalised: string): string {
  const mobile = /^\+92(3\d{2})(\d{7})$/.exec(normalised);
  if (mobile) return `0${mobile[1]} ${mobile[2]}`;
  const pk = /^\+92([1-9]\d{8,9})$/.exec(normalised);
  if (pk) return `0${pk[1]}`;
  const m = /^\+([1-9]\d{7,14})$/.exec(normalised);
  if (!m) return normalised;
  const len = countryCodeLength(m[1]);
  return `+${m[1].slice(0, len)} ${groupDigits(m[1].slice(len))}`;
}
