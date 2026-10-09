import type { Stage } from "./stages";

/**
 * The only place stage changes are decided (BUILD.md section 4). Module 4 uses
 * it for new to assigned; Module 5 adds call outcomes and the save rules.
 */
export const TRANSITIONS: Record<Stage, readonly Stage[]> = {
  new: ["assigned"],
  assigned: ["no_answer", "follow_up", "interested", "not_interested", "invalid"],
  no_answer: ["no_answer", "follow_up", "interested", "not_interested", "invalid"],
  follow_up: ["no_answer", "follow_up", "interested", "not_interested", "invalid"],
  interested: ["with_analyst", "documents_pending", "follow_up", "not_interested"],
  with_analyst: ["post_session", "interested"],
  post_session: ["documents_pending", "with_analyst", "not_interested"],
  documents_pending: ["deposit_recorded", "not_interested"],
  deposit_recorded: ["deposit_verified", "documents_pending"],
  deposit_verified: [],
  not_interested: ["new"],
  invalid: ["follow_up"],
};

/** Stages a lead is still being worked in (mirrors private.is_open_stage in the database). */
export const OPEN_STAGES: readonly Stage[] = [
  "assigned",
  "no_answer",
  "follow_up",
  "interested",
  "with_analyst",
  "post_session",
  "documents_pending",
  "deposit_recorded",
];

export function isOpenStage(stage: Stage): boolean {
  return OPEN_STAGES.includes(stage);
}

export function canTransition(from: Stage, to: Stage): boolean {
  return TRANSITIONS[from].includes(to);
}

export class StageTransitionError extends Error {
  constructor(
    readonly from: Stage,
    readonly to: Stage,
  ) {
    super(`A lead cannot move from ${from} to ${to}.`);
    this.name = "StageTransitionError";
  }
}

/** Throws unless `from` may move to `to`. */
export function assertTransition(from: Stage, to: Stage): void {
  if (!canTransition(from, to)) throw new StageTransitionError(from, to);
}

/** Stage a lead takes when it reaches a team. Leads already being worked keep theirs. */
export function stageOnTeamAssignment(current: Stage): Stage {
  if (current === "new") {
    assertTransition("new", "assigned");
    return "assigned";
  }
  return current;
}

// ---------------------------------------------------------------------------
// Calls and moves (Module 5)
// ---------------------------------------------------------------------------

export const CALL_OUTCOMES = ["no_answer", "follow_up", "interested", "not_interested", "invalid"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  no_answer: "No answer",
  follow_up: "Follow-up",
  interested: "Interested",
  not_interested: "Not interested",
  invalid: "Invalid",
};

/** Stages a lead may only be in with a booked follow-up (mirrors private.needs_follow_up). */
export const NEEDS_FOLLOW_UP: readonly Stage[] = [
  "no_answer",
  "follow_up",
  "interested",
  "with_analyst",
  "post_session",
  "documents_pending",
];
const NEEDS_REASON: readonly Stage[] = ["not_interested", "invalid"];
const NEEDS_NOTE: readonly CallOutcome[] = ["interested", "not_interested"];

/** A rule broken by what the person entered. The message says what to fix. */
export class LeadRuleError extends Error {
  constructor(
    message: string,
    readonly field?: "outcome" | "notes" | "followUpAt" | "reason",
  ) {
    super(message);
    this.name = "LeadRuleError";
  }
}

export type CallInput = {
  stage: Stage;
  noAnswerCount: number;
  maxTries: number;
  outcome: CallOutcome | null;
  notes: string;
  followUpAt: Date | null;
  reason: string;
};

export type CallDecision = {
  newStage: Stage;
  noAnswerIncrement: number;
  releaseAgent: boolean;
  followUpAt: Date | null;
  reason: string | null;
};

/** Outcomes a call may have from this stage: staying put, or an allowed transition. */
export function outcomesFor(stage: Stage): CallOutcome[] {
  if (!isOpenStage(stage)) return [];
  return CALL_OUTCOMES.filter((o) => o === stage || canTransition(stage, o));
}

/**
 * Decide what a logged call does (BUILD.md Module 5). A call whose outcome is the
 * current stage is not a transition, so it is allowed from any open stage.
 */
export function decideCall(input: CallInput): CallDecision {
  const { stage, outcome } = input;
  if (!outcome) throw new LeadRuleError("Choose what happened on the call.", "outcome");
  if (!isOpenStage(stage)) throw new LeadRuleError("Calls can only be logged on open leads.", "outcome");
  if (outcome !== stage) assertTransition(stage, outcome);

  const notes = input.notes.trim();
  if (NEEDS_NOTE.includes(outcome) && !notes) {
    throw new LeadRuleError(`Add a note: what did they say?`, "notes");
  }
  const reason = input.reason.trim();
  if (NEEDS_REASON.includes(outcome) && !reason) throw new LeadRuleError("Choose a reason.", "reason");
  if (NEEDS_FOLLOW_UP.includes(outcome) && !input.followUpAt) {
    throw new LeadRuleError("Book the next follow-up.", "followUpAt");
  }

  const isNoAnswer = outcome === "no_answer";
  const tries = input.noAnswerCount + (isNoAnswer ? 1 : 0);
  return {
    newStage: outcome,
    noAnswerIncrement: isNoAnswer ? 1 : 0,
    // At the limit the lead keeps its team, loses its agent, and goes back to the Team Lead.
    releaseAgent: isNoAnswer && tries >= input.maxTries,
    followUpAt: NEEDS_FOLLOW_UP.includes(outcome) ? input.followUpAt : null,
    reason: NEEDS_REASON.includes(outcome) ? reason : null,
  };
}

/**
 * Check a saved stage: an open stage needs a booked follow-up, a closed one a reason.
 * Throws LeadRuleError otherwise.
 */
export function assertSaveRules(stage: Stage, followUpAt: Date | null, reason: string | null): void {
  if (NEEDS_FOLLOW_UP.includes(stage) && !followUpAt) throw new LeadRuleError("Book the next follow-up.", "followUpAt");
  if (NEEDS_REASON.includes(stage) && !reason?.trim()) throw new LeadRuleError("Choose a reason.", "reason");
}

/** A move made with a stage button rather than a call (for example Interested to Documents pending). */
export function decideMove(from: Stage, to: Stage, followUpAt: Date | null, reason: string | null) {
  assertTransition(from, to);
  assertSaveRules(to, followUpAt, reason);
  return { newStage: to, followUpAt: NEEDS_FOLLOW_UP.includes(to) ? followUpAt : null, reason: NEEDS_REASON.includes(to) ? reason : null };
}

/** Stage buttons on the lead page that are not call outcomes, and the module that enables each. */
export const MOVE_BUTTONS: Partial<Record<Stage, { to: Stage; label: string; module?: number }[]>> = {
  interested: [
    { to: "with_analyst", label: "Refer to Technical Analysis" },
    { to: "documents_pending", label: "Start documents" },
  ],
  post_session: [
    { to: "documents_pending", label: "Start documents" },
    { to: "with_analyst", label: "Book another session" },
  ],
  documents_pending: [{ to: "deposit_recorded", label: "Record a deposit" }],
};
