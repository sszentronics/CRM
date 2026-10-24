import { describe, expect, it } from "vitest";
import { canAccess } from "@/lib/auth/access";
import { needsMfa } from "@/lib/auth/roles";
import { contrastWithWhite, DEFAULT_THEME, parseTheme, themeCss, themeProblem } from "@/lib/workspace/theme";
import { trialDaysLeft, trialEnded } from "@/lib/workspace/trial";

describe("client themes", () => {
  it("accepts the QuantraPro defaults", () => {
    expect(themeProblem(DEFAULT_THEME)).toBeNull();
  });

  it("refuses a main colour too light for white button text", () => {
    expect(themeProblem({ primary: "#ffee00", rail: "#08150f" })).toMatch(/main colour/);
  });

  it("refuses a sidebar colour too light for white text", () => {
    expect(themeProblem({ primary: "#057940", rail: "#dddddd" })).toMatch(/sidebar colour/);
  });

  it("refuses anything that is not a six-digit hex colour", () => {
    expect(themeProblem({ primary: "red", rail: "#08150f" })).toMatch(/colour picker/);
    expect(themeProblem({ primary: "#057940;}body{display:none", rail: "#08150f" })).toMatch(/colour picker/);
  });

  it("measures contrast against white", () => {
    expect(contrastWithWhite("#000000")).toBeCloseTo(21, 0);
    expect(contrastWithWhite("#ffffff")).toBeCloseTo(1, 1);
  });

  it("reads a stored theme and ignores anything else", () => {
    expect(parseTheme({ primary: "#d97706", rail: "#1c1917" })).toEqual({ primary: "#d97706", rail: "#1c1917" });
    expect(parseTheme(null)).toBeNull();
    expect(parseTheme({ primary: "#d97706" })).toBeNull();
    expect(parseTheme({ primary: "javascript:alert(1)", rail: "#1c1917" })).toBeNull();
  });

  it("writes CSS only for valid colours", () => {
    expect(themeCss(null)).toBe("");
    expect(themeCss({ primary: "#ffee00", rail: "#08150f" })).toBe("");
    const css = themeCss({ primary: "#7a3fd1", rail: "#220b47" });
    expect(css).toContain("--tl-primary:#7a3fd1");
    expect(css).toContain("--tl-brand:#220b47");
    expect(css.startsWith("html:root{")).toBe(true);
  });
});

describe("the 14-day demo", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const days = (n: number) => new Date(now + n * 86_400_000).toISOString();

  it("counts whole days left, rounding up", () => {
    expect(trialDaysLeft("trial", days(14), now)).toBe(14);
    expect(trialDaysLeft("trial", new Date(now + 3_600_000).toISOString(), now)).toBe(1);
  });

  it("ends at zero and never goes negative", () => {
    expect(trialDaysLeft("trial", days(-3), now)).toBe(0);
    expect(trialEnded("trial", days(-3), now)).toBe(true);
    expect(trialEnded("trial", days(2), now)).toBe(false);
  });

  it("has no end date for a client workspace", () => {
    expect(trialDaysLeft("client", null, now)).toBeNull();
    expect(trialEnded("client", null, now)).toBe(false);
  });
});

describe("workspace access", () => {
  it("lets Admin and Superadmin skip the authenticator step only in a demo workspace", () => {
    expect(needsMfa("superadmin", "client")).toBe(true);
    expect(needsMfa("superadmin")).toBe(true);
    expect(needsMfa("superadmin", "trial")).toBe(false);
    expect(needsMfa("agent", "client")).toBe(false);
  });

  it("opens the Workspace page to the Superadmin only", () => {
    expect(canAccess("superadmin", "/workspace")).toBe(true);
    for (const role of ["admin", "team_lead", "agent", "analyst"] as const) expect(canAccess(role, "/workspace"), role).toBe(false);
  });
});
