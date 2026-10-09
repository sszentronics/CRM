import { describe, expect, it } from "vitest";
import { canRefer, decideSessionOutcome, sessionReportErrors } from "@/lib/sessions/rules";

const ANALYST = "aaaaaaaa-0000-4000-8000-000000000001";

describe("session outcomes", () => {
  it("Attended sets the credited analyst and moves the lead to post_session", () => {
    expect(decideSessionOutcome("attended", "with_analyst", ANALYST)).toEqual({
      newStage: "post_session",
      creditedAnalystId: ANALYST,
      handBack: true,
    });
  });

  it("No-show changes neither the stage nor the credit", () => {
    expect(decideSessionOutcome("no_show", "with_analyst", ANALYST)).toEqual({
      newStage: "with_analyst",
      creditedAnalystId: null,
      handBack: true,
    });
  });

  it("cannot close a session on a lead that is not with the analyst", () => {
    expect(() => decideSessionOutcome("attended", "documents_pending", ANALYST)).toThrow();
  });
});

describe("referrals", () => {
  it("are open to interested clients and after a session, and again after a no-show", () => {
    expect(canRefer("interested")).toBe(true);
    expect(canRefer("post_session")).toBe(true);
    expect(canRefer("with_analyst")).toBe(true);
    expect(canRefer("assigned")).toBe(false);
    expect(canRefer("documents_pending")).toBe(false);
  });
});

describe("session report", () => {
  it("needs level, interest and notes when the client attended", () => {
    expect(Object.keys(sessionReportErrors({ outcome: "attended", clientLevel: "", interestLevel: "", notes: "", nextStep: "" })).sort()).toEqual([
      "clientLevel",
      "interestLevel",
      "notes",
    ]);
  });

  it("needs only the outcome for a no-show", () => {
    expect(sessionReportErrors({ outcome: "no_show", clientLevel: "", interestLevel: "", notes: "", nextStep: "" })).toEqual({});
    expect(sessionReportErrors({ outcome: null, clientLevel: "", interestLevel: "", notes: "", nextStep: "" }).outcome).toBe(
      "Choose whether the client attended.",
    );
  });
});
