const DAY = 86_400_000;

export const TRIAL_DAYS = 14;

/** Whole days left in a demo, rounded up, never below zero. Null for a client workspace. */
export function trialDaysLeft(plan: "client" | "trial", trialEndsAt: string | null, now = Date.now()): number | null {
  if (plan !== "trial" || !trialEndsAt) return null;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now) / DAY));
}

export function trialEnded(plan: "client" | "trial", trialEndsAt: string | null, now = Date.now()): boolean {
  return trialDaysLeft(plan, trialEndsAt, now) === 0;
}
