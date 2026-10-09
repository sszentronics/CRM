import { describe, expect, it } from "vitest";
import { ageNote, ageTone } from "@/lib/dashboards/age";

const now = new Date("2026-10-09T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("work queue tile colour", () => {
  it("stays plain under 12 hours", () => {
    expect(ageTone(ago(11.9), 3, now)).toBe("default");
  });
  it("turns amber from 12 hours", () => {
    expect(ageTone(ago(12), 3, now)).toBe("wait");
    expect(ageTone(ago(23.9), 3, now)).toBe("wait");
  });
  it("turns red from 24 hours", () => {
    expect(ageTone(ago(24), 3, now)).toBe("danger");
    expect(ageTone(ago(25), 1, now)).toBe("danger");
  });
  it("is never coloured when nothing is waiting", () => {
    expect(ageTone(null, 0, now)).toBe("default");
    expect(ageTone(ago(40), 0, now)).toBe("default");
  });
});

describe("age wording", () => {
  it("says how old and carries the meaning in words", () => {
    expect(ageNote(ago(0.5), 1, now)).toBe("Oldest 30 min");
    expect(ageNote(ago(13), 1, now)).toBe("Oldest 13 h, getting old");
    expect(ageNote(ago(25), 1, now)).toBe("Oldest 25 h, overdue");
    expect(ageNote(ago(72), 1, now)).toBe("Oldest 3 days, overdue");
    expect(ageNote(null, 0, now)).toBe("Nothing waiting");
  });
});
