import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** One run a minute at most per server, however many people open pages. */
const EVERY_MS = 60_000;
let lastRun = 0;

/**
 * The database also runs the referral sweep on a timer, but a timer only fires while the
 * database is up and only every few minutes. Running it when someone opens the app too means
 * an overdue referral alerts the Admins as soon as anyone is looking, not up to a quarter of
 * an hour later. The sweep marks each referral as alerted, so running it often never repeats an alert.
 */
export async function runSweepsIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < EVERY_MS) return;
  lastRun = now;
  try {
    await createAdminClient().rpc("run_referral_sweep");
  } catch {
    // A failed sweep must never stop a page loading. The timer in the database is the backstop.
  }
}
