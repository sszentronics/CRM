import { describe, expect, it } from "vitest";
import { contactFreshness, daysSince, freshnessBounds } from "@/lib/leads/contact";

// 3:00 pm in Karachi on 12 Oct 2026 (10:00 UTC).
const now = new Date("2026-10-12T10:00:00Z");
const daysAgo = (n: number, hourUtc = 10) => new Date(Date.UTC(2026, 9, 12 - n, hourUtc));

describe("contact freshness", () => {
  it("is green for 0 to 3 days, yellow for 4 to 7, red for 8 or more", () => {
    expect(contactFreshness(daysAgo(0), now)).toBe("green");
    expect(contactFreshness(daysAgo(3), now)).toBe("green");
    expect(contactFreshness(daysAgo(4), now)).toBe("yellow");
    expect(contactFreshness(daysAgo(7), now)).toBe("yellow");
    expect(contactFreshness(daysAgo(8), now)).toBe("red");
    expect(contactFreshness(daysAgo(40), now)).toBe("red");
  });

  it("is never for a lead nobody has contacted", () => {
    expect(contactFreshness(null, now)).toBe("never");
  });

  it("counts calendar days in Karachi time, not 24-hour blocks", () => {
    // 11:30 pm Karachi last night (18:30 UTC) is 1 day ago, though only 15.5 hours have passed.
    expect(daysSince(new Date("2026-10-11T18:30:00Z"), now)).toBe(1);
    // 12:30 am Karachi today (19:30 UTC the day before) is today.
    expect(daysSince(new Date("2026-10-11T19:30:00Z"), now)).toBe(0);
  });

  it("never goes negative for a time a moment in the future", () => {
    expect(daysSince(new Date(now.getTime() + 60_000), now)).toBe(0);
  });

  it("gives list bounds that agree with the colour rule", () => {
    const { greenFrom, yellowFrom } = freshnessBounds(now);
    const colourOf = (at: Date) =>
      at.toISOString() >= greenFrom ? "green" : at.toISOString() >= yellowFrom ? "yellow" : "red";
    for (const [n, hour] of [[3, 0], [3, 23], [4, 0], [4, 23], [7, 0], [7, 23], [8, 0], [8, 23]] as const) {
      const at = daysAgo(n, hour);
      expect(colourOf(at), `${n} days ago, ${hour}:00 UTC`).toBe(contactFreshness(at, now));
    }
  });
});
