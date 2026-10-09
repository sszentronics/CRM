import { canTransition } from "@/lib/leads/stage-machine";
import type { Stage } from "@/lib/leads/stages";

export const MODES = [
  { value: "office", label: "At the office" },
  { value: "video", label: "Video call" },
  { value: "phone", label: "Phone call" },
] as const;
export type Mode = (typeof MODES)[number]["value"];

export const CLIENT_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "some_experience", label: "Some experience" },
  { value: "experienced", label: "Experienced" },
] as const;
export type ClientLevel = (typeof CLIENT_LEVELS)[number]["value"];

export const INTEREST_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number]["value"];

export type SessionOutcome = "attended" | "no_show" | "rescheduled";

export const OUTCOME_LABEL: Record<SessionOutcome, string> = {
  attended: "Attended",
  no_show: "No-show",
  rescheduled: "Rescheduled",
};

/** Stages from which a client can be referred (or referred again after a no-show). */
export function canRefer(stage: Stage): boolean {
  return stage === "with_analyst" || canTransition(stage, "with_analyst");
}

/**
 * What saving a session outcome does (BUILD.md Module 6). Attended moves the lead to
 * post_session and credits the analyst. No-show changes neither. Both hand the lead back,
 * which ends the analyst's access. The database applies the same rules.
 */
export function decideSessionOutcome(
  outcome: "attended" | "no_show",
  stage: Stage,
  analystId: string,
): { newStage: Stage; creditedAnalystId: string | null; handBack: true } {
  if (outcome === "attended") {
    if (!canTransition(stage, "post_session")) throw new Error(`A session cannot be closed from ${stage}.`);
    return { newStage: "post_session", creditedAnalystId: analystId, handBack: true };
  }
  return { newStage: stage, creditedAnalystId: null, handBack: true };
}

export type SessionReport = {
  outcome: "attended" | "no_show" | null;
  clientLevel: string;
  interestLevel: string;
  notes: string;
  nextStep: string;
};

/** Fields an analyst must fill before handing back, with a sentence that says what is missing. */
export function sessionReportErrors(r: SessionReport): Partial<Record<keyof SessionReport, string>> {
  const errors: Partial<Record<keyof SessionReport, string>> = {};
  if (!r.outcome) errors.outcome = "Choose whether the client attended.";
  if (r.outcome === "attended") {
    if (!CLIENT_LEVELS.some((l) => l.value === r.clientLevel)) errors.clientLevel = "Choose the client's level.";
    if (!INTEREST_LEVELS.some((l) => l.value === r.interestLevel)) errors.interestLevel = "Choose how interested they are.";
    if (!r.notes.trim()) errors.notes = "Add your notes for the agent.";
  }
  if (r.notes.length > 3000) errors.notes = "Keep notes under 3,000 characters.";
  if (r.nextStep.length > 300) errors.nextStep = "Keep the next step under 300 characters.";
  return errors;
}

/** A referral with no session date after `deadlineHours` (the Admin is alerted by the referral sweep). */
export function isReferralLate(createdAt: string, scheduledAt: string | null, deadlineHours: number, now: Date = new Date()): boolean {
  return !scheduledAt && now.getTime() - new Date(createdAt).getTime() > deadlineHours * 3_600_000;
}
