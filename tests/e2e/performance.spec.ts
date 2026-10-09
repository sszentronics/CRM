import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "./helpers/accounts";
import { loginWith, makePoolLeads, makeTeam } from "./helpers/world";

// A mid-range laptop: the page's work runs four times slower than on this machine, on a production build.
const CPU_SLOWDOWN = 4;
const BUDGET_MS = 2500;

test.use({ viewport: { width: 1440, height: 900 } });

async function interactive(page: Page, url: string, ready: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  const started = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await ready();
  // Interactive means the page has finished loading and the main thread is free again.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  const elapsed = Date.now() - started;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return elapsed;
}

test("Today's calls is interactive in under 2.5 seconds with 150 open leads", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const team = await makeTeam(run, "PF1", 1);
  const leads = await makePoolLeads(run, 150);
  const now = Date.now();
  const stages = ["assigned", "no_answer", "follow_up", "interested"] as const;
  for (let i = 0; i < leads.length; i += 50) {
    const { error } = await serviceClient()
      .from("leads")
      .update({ team_id: team.id, agent_id: team.agents[0].id, stage: stages[(i / 50) % 4], agent_assigned_at: new Date(now - 48 * 3_600_000).toISOString(), next_follow_up_at: new Date(now + 6 * 3_600_000).toISOString() })
      .in("id", leads.slice(i, i + 50).map((l) => l.id));
    if (error) throw error;
  }

  const page = await browser.newPage();
  await loginWith(page, team.agents[0].email);
  // Warm the server once so a cold start does not count against the page.
  await page.goto("/today");
  const ms = await interactive(page, "/today", async () => {
    await expect(page.getByRole("heading", { name: /Today/ }).first()).toBeVisible();
  });
  console.log(`Today's calls interactive in ${ms} ms at ${CPU_SLOWDOWN}x slowdown`);
  expect(ms).toBeLessThan(BUDGET_MS);
  await serviceClient().from("teams").update({ is_active: false }).eq("id", team.id);
});

test("the Arena is interactive in under 2.5 seconds", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const team = await makeTeam(run, "PF2", 2);
  const page = await browser.newPage();
  await loginWith(page, team.agents[0].email);
  await page.goto("/arena");
  const ms = await interactive(page, "/arena", async () => {
    await expect(page.getByRole("heading", { name: "The Arena" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Team race" })).toBeVisible();
  });
  console.log(`The Arena interactive in ${ms} ms at ${CPU_SLOWDOWN}x slowdown`);
  expect(ms).toBeLessThan(BUDGET_MS);
  await serviceClient().from("teams").update({ is_active: false }).eq("id", team.id);
});
