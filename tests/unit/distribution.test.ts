import { describe, expect, it } from "vitest";
import { planEvenDistribution, summarisePlan, type PoolLead } from "@/lib/leads/distribution";
import { assertTransition, canTransition, stageOnTeamAssignment, TRANSITIONS } from "@/lib/leads/stage-machine";
import { STAGES } from "@/lib/leads/stages";

function pool(perSource: Record<string, number>): PoolLead[] {
  const out: PoolLead[] = [];
  let i = 0;
  for (const [source, n] of Object.entries(perSource)) {
    for (let k = 0; k < n; k++, i++) {
      out.push({ id: `lead-${String(i).padStart(4, "0")}`, source, created_at: new Date(2026, 9, 1, 0, i).toISOString() });
    }
  }
  return out;
}

const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

describe("planEvenDistribution", () => {
  it("gives 4 teams 50 leads each from 200 leads in 4 sources, per-source counts within 1", () => {
    const leads = pool({ Facebook: 50, Instagram: 50, TikTok: 50, PR: 50 });
    const teams = ["falcons", "markhors", "shaheens", "leopards"];
    const plan = planEvenDistribution(leads, teams);
    const { sources, rows } = summarisePlan(plan, leads);
    expect(rows.map((r) => r.total)).toEqual([50, 50, 50, 50]);
    for (const s of sources) expect(spread(rows.map((r) => r.bySource[s])), s).toBeLessThanOrEqual(1);
  });

  it("stays balanced with uneven sources", () => {
    const leads = pool({ Facebook: 97, Instagram: 41, TikTok: 30, PR: 19, Referral: 13 });
    const teams = ["a", "b", "c", "d"];
    const { sources, rows } = summarisePlan(planEvenDistribution(leads, teams), leads);
    expect(spread(rows.map((r) => r.total))).toBeLessThanOrEqual(1);
    for (const s of sources) expect(spread(rows.map((r) => r.bySource[s])), s).toBeLessThanOrEqual(1);
  });

  it("places every lead exactly once", () => {
    const leads = pool({ Facebook: 23, PR: 7 });
    const plan = planEvenDistribution(leads, ["x", "y", "z"]);
    const placed = Object.values(plan).flat();
    expect(placed.sort()).toEqual(leads.map((l) => l.id).sort());
  });

  it("is deterministic, so the preview and the confirmed run agree", () => {
    const leads = pool({ Facebook: 31, Instagram: 12, TikTok: 9 });
    const shuffled = [...leads].reverse();
    expect(planEvenDistribution(shuffled, ["a", "b", "c"])).toEqual(planEvenDistribution(leads, ["a", "b", "c"]));
  });

  it("only plans: it does not touch its inputs and has nothing to write with", () => {
    const leads = pool({ Facebook: 10, PR: 10 });
    const snapshot = JSON.stringify(leads);
    const teams = Object.freeze(["a", "b"]);
    planEvenDistribution(Object.freeze(leads.map((l) => Object.freeze({ ...l }))), teams);
    expect(JSON.stringify(leads)).toBe(snapshot);
    // The planner takes data only, no database client; nothing can be written while previewing.
    expect(planEvenDistribution.length).toBe(2);
  });

  it("returns empty lists when there are no teams or no leads", () => {
    expect(planEvenDistribution([], ["a"])).toEqual({ a: [] });
    expect(planEvenDistribution(pool({ PR: 3 }), [])).toEqual({});
  });
});

describe("stage machine", () => {
  it("allows exactly the transitions in BUILD.md section 4", () => {
    for (const from of STAGES) {
      for (const to of STAGES) {
        const allowed = TRANSITIONS[from].includes(to);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(allowed);
        if (allowed) expect(() => assertTransition(from, to)).not.toThrow();
        else expect(() => assertTransition(from, to), `${from} -> ${to}`).toThrow();
      }
    }
  });

  it("moves a new lead to assigned when it reaches a team, and leaves others alone", () => {
    expect(stageOnTeamAssignment("new")).toBe("assigned");
    expect(stageOnTeamAssignment("follow_up")).toBe("follow_up");
  });
});
