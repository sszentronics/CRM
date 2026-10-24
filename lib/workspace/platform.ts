import "server-only";

/**
 * The QuantraPro team: people who may see every workspace and promote demos to clients.
 * Set PLATFORM_ADMIN_EMAILS to a comma-separated list. Empty means nobody.
 */
export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
