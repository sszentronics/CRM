import { describe, expect, it } from "vitest";
import { laneShare, periodBounds, rankMovement, showStreak } from "@/lib/boards/periods";

// 12 Oct 2026 is a Monday; 14 Oct 2026, 15:00 in Karachi, is a Wednesday.
const wed = new Date("2026-10-14T10:00:00Z");

describe("period bounds (Karachi time)", () => {
  it("today runs midnight to midnight in Karachi", () => {
    const { from, to } = periodBounds("today", wed);
    expect(from.toISOString()).toBe("2026-10-13T19:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-14T19:00:00.000Z");
  });
  it("the week starts on Monday", () => {
    const { from, to } = periodBounds("week", wed);
    expect(from.toISOString()).toBe("2026-10-11T19:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-18T19:00:00.000Z");
  });
  it("a Sunday still belongs to the week that began the Monday before", () => {
    const sunday = new Date("2026-10-18T10:00:00Z");
    expect(periodBounds("week", sunday).from.toISOString()).toBe("2026-10-11T19:00:00.000Z");
  });
  it("the month runs from the 1st to the 1st", () => {
    const { from, to } = periodBounds("month", wed);
    expect(from.toISOString()).toBe("2026-09-30T19:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-31T19:00:00.000Z");
  });
  it("December rolls into the next year", () => {
    const { to } = periodBounds("month", new Date("2026-12-10T10:00:00Z"));
    expect(to.toISOString()).toBe("2026-12-31T19:00:00.000Z");
  });
  it("all time reaches back before any deposit and forward to tomorrow", () => {
    const { from, to } = periodBounds("all", wed);
    expect(from.getUTCFullYear()).toBe(2000);
    expect(to > wed).toBe(true);
  });
});

describe("lanes", () => {
  it("fill toward target in the month, and report the percentage", () => {
    expect(laneShare("month", 850_000, 1_000_000, 850_000)).toEqual({ value: 850_000, target: 1_000_000, pct: 85 });
  });
  it("keep counting past 100 percent", () => {
    expect(laneShare("month", 1_250_000, 1_000_000, 1_250_000).pct).toBe(125);
  });
  it("scale to the leader when there is no target, or another period", () => {
    expect(laneShare("month", 100, null, 400)).toEqual({ value: 100, target: 400, pct: null });
    expect(laneShare("week", 100, 1_000_000, 400).pct).toBeNull();
  });
});

describe("rank arrows and streaks", () => {
  it("moving from 3 to 1 is two places up", () => {
    expect(rankMovement(1, 3)).toBe(2);
    expect(rankMovement(4, 2)).toBe(-2);
  });
  it("shows nothing when unchanged or new", () => {
    expect(rankMovement(2, 2)).toBeUndefined();
    expect(rankMovement(2, null)).toBeUndefined();
  });
  it("streaks show from day 3", () => {
    expect(showStreak(2)).toBe(false);
    expect(showStreak(3)).toBe(true);
  });
});
