import { describe, expect, it } from "vitest";
import { canAccess, safeNext } from "@/lib/auth/access";
import { ROLE_HOME, ROLES } from "@/lib/auth/roles";
import { NAV_ITEMS } from "@/lib/nav";

describe("route access", () => {
  it("lets every role open its own home", () => {
    for (const role of ROLES) expect(canAccess(role, ROLE_HOME[role]), role).toBe(true);
  });

  it("opens Users and teams to the Superadmin and the Admin only", () => {
    expect(canAccess("superadmin", "/users")).toBe(true);
    expect(canAccess("admin", "/users")).toBe(true);
    for (const role of ["team_lead", "agent", "analyst"] as const) {
      expect(canAccess(role, "/users"), role).toBe(false);
    }
  });

  it("opens the Arena to everyone", () => {
    for (const role of ROLES) expect(canAccess(role, "/arena")).toBe(true);
  });

  it("closes paths it does not know", () => {
    expect(canAccess("superadmin", "/secret")).toBe(false);
  });

  it("matches sub-paths by their screen", () => {
    expect(canAccess("agent", "/today/anything")).toBe(true);
    expect(canAccess("agent", "/users/123")).toBe(false);
  });

  it("has an access rule for every menu item", () => {
    for (const item of NAV_ITEMS) expect(ROLES.some((r) => canAccess(r, item.href)), item.href).toBe(true);
  });
});

describe("safeNext", () => {
  it("follows a same-site path the role may open", () => {
    expect(safeNext("agent", "/pipeline")).toBe("/pipeline");
  });

  it("ignores other sites and closed screens", () => {
    expect(safeNext("agent", "//evil.example")).toBeNull();
    expect(safeNext("agent", "https://evil.example")).toBeNull();
    expect(safeNext("agent", "/users")).toBeNull();
  });
});
