import { describe, expect, it, vi } from "vitest";
import { createUserCore, type CreateUserDeps } from "@/lib/users/create-user";
import { createUserSchema } from "@/lib/users/schemas";

const ACTOR = { id: "11111111-1111-4111-8111-111111111111" };
const NEW_ID = "22222222-2222-4222-8222-222222222222";
const TEAM = "33333333-3333-4333-8333-333333333333";

function deps(overrides: Partial<CreateUserDeps> = {}) {
  const audit = vi.fn<CreateUserDeps["audit"]>().mockResolvedValue(undefined);
  const d: CreateUserDeps = {
    inviteUser: vi.fn().mockResolvedValue({ id: NEW_ID }),
    insertProfile: vi.fn().mockResolvedValue(undefined),
    removeAuthUser: vi.fn().mockResolvedValue(undefined),
    audit,
    ...overrides,
  };
  return { d, audit };
}

const input = createUserSchema.parse({
  fullName: "Hira Malik",
  email: "Hira@TradingLabs.test",
  phone: "0300 1234567",
  role: "agent",
  teamId: TEAM,
});

describe("createUserCore", () => {
  it("writes exactly one audit row with the actor and the new user id", async () => {
    const { d, audit } = deps();
    const result = await createUserCore(d, ACTOR, input);
    expect(result.id).toBe(NEW_ID);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: ACTOR.id, action: "user.create", entity: "profile", entityId: NEW_ID }),
    );
  });

  it("saves the normalised profile", async () => {
    const { d } = deps();
    await createUserCore(d, ACTOR, input);
    expect(d.insertProfile).toHaveBeenCalledWith({
      id: NEW_ID,
      full_name: "Hira Malik",
      email: "hira@tradinglabs.test",
      phone: "+923001234567",
      role: "agent",
      team_id: TEAM,
    });
  });

  it("removes the half-created account and writes no audit row when the profile fails", async () => {
    const { d, audit } = deps({ insertProfile: vi.fn().mockRejectedValue(new Error("duplicate phone")) });
    await expect(createUserCore(d, ACTOR, input)).rejects.toThrow("duplicate phone");
    expect(d.removeAuthUser).toHaveBeenCalledWith(NEW_ID);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("createUserSchema", () => {
  it("requires a team for an agent", () => {
    const r = createUserSchema.safeParse({ fullName: "Ali", email: "ali@x.test", role: "agent" });
    expect(r.success).toBe(false);
  });

  it("drops any team for roles outside teams", () => {
    const r = createUserSchema.parse({ fullName: "Omar F", email: "omar@x.test", role: "analyst", teamId: TEAM });
    expect(r.teamId).toBeNull();
  });

  it("rejects a bad phone with a sentence that says how to fix it", () => {
    const r = createUserSchema.safeParse({ fullName: "Ali", email: "ali@x.test", role: "admin", phone: "12345" });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("Use the form 0300 1234567");
  });
});
