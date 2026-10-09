import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getSetting } from "@/lib/settings/get-setting";

// Runs against the local Supabase from `pnpm db:start`, whose migrations seed the defaults.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

describe("getSetting against the local database", () => {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  it("returns 5 for max_call_tries on a fresh database", async () => {
    expect(await getSetting(client, "max_call_tries")).toBe(5);
  });

  it("returns the default lead sources", async () => {
    expect(await getSetting(client, "lead_sources")).toEqual(["Facebook", "Instagram", "TikTok", "PR", "Referral", "Walk-in"]);
  });
});
