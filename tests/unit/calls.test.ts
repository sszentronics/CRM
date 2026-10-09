import { describe, expect, it } from "vitest";
import {
  dateToKarachiInput,
  describeWhen,
  followUpQuickPicks,
  karachiDayBounds,
  karachiInputToDate,
} from "@/lib/format/dates";
import {
  assertSaveRules,
  decideCall,
  decideMove,
  LeadRuleError,
  NEEDS_FOLLOW_UP,
  outcomesFor,
  type CallInput,
} from "@/lib/leads/stage-machine";
import { STAGES } from "@/lib/leads/stages";

const later = new Date("2026-10-09T10:00:00Z");
const base: CallInput = {
  stage: "assigned",
  noAnswerCount: 0,
  maxTries: 5,
  outcome: "no_answer",
  notes: "",
  followUpAt: later,
  reason: "",
};

describe("saving a stage", () => {
  it("fails for an open stage without next_follow_up_at", () => {
    for (const stage of NEEDS_FOLLOW_UP) {
      expect(() => assertSaveRules(stage, null, null), stage).toThrow(LeadRuleError);
      expect(() => assertSaveRules(stage, later, null), stage).not.toThrow();
    }
  });

  it("fails for Not interested and Invalid without a reason", () => {
    expect(() => assertSaveRules("not_interested", null, "")).toThrow("Choose a reason.");
    expect(() => assertSaveRules("invalid", null, "Wrong number")).not.toThrow();
  });

  it("a move checks both the transition and the save rules", () => {
    expect(() => decideMove("interested", "documents_pending", null, null)).toThrow("Book the next follow-up.");
    expect(decideMove("interested", "documents_pending", later, null).newStage).toBe("documents_pending");
    expect(() => decideMove("assigned", "documents_pending", later, null)).toThrow();
  });
});

describe("decideCall", () => {
  it("needs an outcome", () => {
    expect(() => decideCall({ ...base, outcome: null })).toThrow("Choose what happened on the call.");
  });

  it("needs a note for Interested and Not interested", () => {
    expect(() => decideCall({ ...base, outcome: "interested" })).toThrow("Add a note");
    expect(() => decideCall({ ...base, outcome: "not_interested", reason: "No trust" })).toThrow("Add a note");
    expect(decideCall({ ...base, outcome: "interested", notes: "Wants PSX info" }).newStage).toBe("interested");
  });

  it("needs a follow-up time for Interested, Follow-up and No answer", () => {
    for (const outcome of ["interested", "follow_up", "no_answer"] as const) {
      expect(() => decideCall({ ...base, outcome, notes: "x", followUpAt: null }), outcome).toThrow("Book the next follow-up.");
    }
  });

  it("needs a reason for Not interested and Invalid, and books no follow-up", () => {
    expect(() => decideCall({ ...base, outcome: "invalid", followUpAt: null })).toThrow("Choose a reason.");
    const d = decideCall({ ...base, outcome: "invalid", reason: "Wrong number", followUpAt: later });
    expect(d).toMatchObject({ newStage: "invalid", reason: "Wrong number", followUpAt: null });
  });

  it("counts a No answer and keeps the agent before the limit", () => {
    const d = decideCall({ ...base, noAnswerCount: 3 });
    expect(d).toMatchObject({ newStage: "no_answer", noAnswerIncrement: 1, releaseAgent: false });
  });

  it("returns the lead to the Team Lead on the fifth No answer", () => {
    const d = decideCall({ ...base, stage: "no_answer", noAnswerCount: 4 });
    expect(d).toMatchObject({ newStage: "no_answer", noAnswerIncrement: 1, releaseAgent: true });
  });

  it("does not count other outcomes towards the limit", () => {
    const d = decideCall({ ...base, stage: "no_answer", noAnswerCount: 4, outcome: "follow_up" });
    expect(d.releaseAgent).toBe(false);
    expect(d.noAnswerIncrement).toBe(0);
  });

  it("refuses an outcome the stage table does not allow", () => {
    expect(() => decideCall({ ...base, stage: "interested", outcome: "no_answer" })).toThrow();
    expect(() => decideCall({ ...base, stage: "not_interested" })).toThrow("open leads");
  });

  it("offers only outcomes allowed from the stage", () => {
    expect(outcomesFor("assigned")).toEqual(["no_answer", "follow_up", "interested", "not_interested", "invalid"]);
    expect(outcomesFor("interested")).toEqual(["follow_up", "interested", "not_interested"]);
    expect(outcomesFor("deposit_verified")).toEqual([]);
    for (const s of STAGES) for (const o of outcomesFor(s)) expect(() => decideCall({ ...base, stage: s, outcome: o, notes: "n", reason: "r" })).not.toThrow();
  });
});

describe("Karachi time", () => {
  it("reads and writes datetime-local values in Karachi time", () => {
    const d = karachiInputToDate("2026-10-09T15:00")!;
    expect(d.toISOString()).toBe("2026-10-09T10:00:00.000Z");
    expect(dateToKarachiInput(d)).toBe("2026-10-09T15:00");
    expect(karachiInputToDate("15:00")).toBeNull();
  });

  it("knows where the Karachi day starts", () => {
    const { start, end } = karachiDayBounds(new Date("2026-10-08T20:00:00Z")); // 1 am on 9 Oct in Karachi
    expect(start.toISOString()).toBe("2026-10-08T19:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-09T19:00:00.000Z");
  });

  it("offers quick picks in the future, tomorrow at 11 am Karachi", () => {
    const now = new Date("2026-10-08T09:07:00Z"); // 2:07 pm Karachi
    const picks = followUpQuickPicks(now);
    expect(picks.every((p) => p.at > now)).toBe(true);
    expect(picks.find((p) => p.key === "tomorrow")!.at.toISOString()).toBe("2026-10-09T06:00:00.000Z");
    expect(picks.find((p) => p.key === "2h")!.at.toISOString()).toBe("2026-10-08T11:15:00.000Z");
  });

  it("describes when a follow-up is", () => {
    const now = new Date("2026-10-08T09:00:00Z");
    expect(describeWhen(new Date("2026-10-08T10:00:00Z"), now)).toBe("today at 3:00 pm");
    expect(describeWhen(new Date("2026-10-09T06:00:00Z"), now)).toBe("tomorrow at 11:00 am");
    expect(describeWhen(new Date("2026-10-10T10:00:00Z"), now)).toBe("Sat 10 Oct at 3:00 pm");
  });
});
