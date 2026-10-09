/** Lead stages, in pipeline order. Mirrors the Postgres enum (BUILD.md section 4). */
export const STAGES = [
  "new",
  "assigned",
  "no_answer",
  "follow_up",
  "interested",
  "with_analyst",
  "post_session",
  "documents_pending",
  "deposit_recorded",
  "deposit_verified",
  "not_interested",
  "invalid",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  assigned: "Assigned",
  no_answer: "No answer",
  follow_up: "Follow-up",
  interested: "Interested",
  with_analyst: "With Technical Analysis",
  post_session: "Post-session follow-up",
  documents_pending: "Documents pending",
  deposit_recorded: "Deposit recorded",
  deposit_verified: "Deposit verified",
  not_interested: "Not interested",
  invalid: "Invalid",
};

/** CSS variable holding each stage's colour (DESIGN.md section 3). */
export const STAGE_COLOR_VAR: Record<Stage, string> = {
  new: "--tl-stage-idle",
  assigned: "--tl-stage-idle",
  no_answer: "--tl-stage-call",
  follow_up: "--tl-stage-call",
  interested: "--tl-stage-hot",
  with_analyst: "--tl-stage-analyst",
  post_session: "--tl-stage-hot",
  documents_pending: "--tl-stage-docs",
  deposit_recorded: "--tl-stage-recorded",
  deposit_verified: "--tl-stage-verified",
  not_interested: "--tl-stage-closed",
  invalid: "--tl-stage-closed",
};
