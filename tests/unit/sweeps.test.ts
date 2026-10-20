import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

describe("runSweepsIfDue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    vi.resetModules();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: 0, error: null });
  });
  afterEach(() => vi.useRealTimers());

  it("runs the referral sweep when someone opens a page", async () => {
    const { runSweepsIfDue } = await import("@/lib/sweeps");
    await runSweepsIfDue();
    expect(rpc).toHaveBeenCalledWith("run_referral_sweep");
  });

  it("runs at most once a minute however many pages open", async () => {
    const { runSweepsIfDue } = await import("@/lib/sweeps");
    await runSweepsIfDue();
    await runSweepsIfDue();
    vi.advanceTimersByTime(59_000);
    await runSweepsIfDue();
    expect(rpc).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await runSweepsIfDue();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("never stops a page loading when the sweep fails", async () => {
    rpc.mockRejectedValue(new Error("database down"));
    const { runSweepsIfDue } = await import("@/lib/sweeps");
    await expect(runSweepsIfDue()).resolves.toBeUndefined();
  });
});
