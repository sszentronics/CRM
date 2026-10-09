/**
 * Hide everything except the last `visible` characters, for CNIC and IBAN in
 * lists. The output length does not depend on the input, so it leaks nothing
 * beyond the tail. "3520212345671" -> "•••• 5671".
 */
export function maskTail(value: string, visible = 4): string {
  const clean = value.replace(/[\s-]/g, "");
  if (clean.length <= visible) return "••••";
  return `•••• ${clean.slice(-visible)}`;
}
