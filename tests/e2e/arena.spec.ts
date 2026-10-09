import { expect, test, type Page } from "@playwright/test";
import { serviceClient, storageStateFor } from "./helpers/accounts";
import { readyClient, seedDeposit } from "./helpers/deposits";
import { loginWith, makeAnalyst, makeTeam, type WorldTeam } from "./helpers/world";

// The Arena shows the leading teams, so these tests use very large amounts and clean up after
// themselves: a team that is switched off no longer appears on the board.
test.describe.configure({ mode: "serial" });

const runId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const MILLION = 1_000_000;
const created: string[] = [];

async function arenaTeam(run: string, label: string, color = 0) {
  const team = await makeTeam(run, label, 1, color);
  created.push(team.id);
  return team;
}

test.beforeAll(async () => {
  // Switch off teams left behind by an earlier, interrupted run.
  await serviceClient().from("teams").update({ is_active: false }).like("name", "Team AR%");
});

test.afterAll(async () => {
  if (created.length) await serviceClient().from("teams").update({ is_active: false }).in("id", created);
});

const lane = (page: Page, team: WorldTeam) => page.getByRole("listitem", { name: new RegExp(`^${team.name}, rank`) });

for (const width of [1024, 1440, 1920]) {
  test(`the Arena is dark purple from top to bottom at ${width} px`, async ({ browser }) => {
    const run = runId();
    const team = await arenaTeam(run, "AR1");
    const agent = await browser.newPage({ viewport: { width, height: 800 } });
    await loginWith(agent, team.agents[0].email);
    await agent.goto("/arena");
    await expect(agent.getByRole("heading", { name: "The Arena" })).toBeVisible();

    const stage = await agent.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".tl-arena")!;
      const image = getComputedStyle(el).backgroundImage;
      const probe = (y: number) => document.elementFromPoint(window.innerWidth / 2, y)?.closest(".tl-arena") !== null;
      return { image, top: probe(4), bottom: probe(window.innerHeight - 4), tall: el.getBoundingClientRect().height >= window.innerHeight };
    });
    // The gradient runs from --tl-arena-top to --tl-arena-bottom, both purple, never black.
    expect(stage.image).toContain("rgb(44, 15, 92)");
    expect(stage.image).toContain("rgb(28, 8, 59)");
    expect(stage.top && stage.bottom && stage.tall).toBe(true);
    // No horizontal scroll at any width.
    expect(await agent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("Admin verifies in one browser and the Arena in another shows the total and feed row within 5 seconds, with a burst", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await arenaTeam(run, "AR2");
  const client = await readyClient(run, team, null);
  const ref = `ARENA-${run}`.toUpperCase();
  await seedDeposit(team, client, 123 * MILLION, ref);
  // A verified deposit already on the board keeps the team in the top lanes however many teams exist.
  const earlier = await readyClient(`${run}b`, team, null);
  await seedDeposit(team, earlier, 10 * MILLION, `EARLIER-${run}`.toUpperCase(), { verify: true });

  const viewer = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await loginWith(viewer, team.agents[0].email);
  await viewer.goto("/arena");
  await expect(lane(viewer, team)).toContainText("Rs 10,000,000");
  await expect(viewer.getByLabel("Your standing")).toBeVisible();
  // The burst lasts 1.2 seconds, so record whether it ever appears.
  await viewer.evaluate(() => {
    (window as unknown as { __bursts: number }).__bursts = 0;
    new MutationObserver(() => {
      if (document.querySelector("[data-testid=burst]")) (window as unknown as { __bursts: number }).__bursts += 1;
    }).observe(document.body, { childList: true, subtree: true });
  });

  const admin = await browser.newPage({ storageState: storageStateFor("admin"), viewport: { width: 1440, height: 900 } });
  await admin.goto("/deposits");
  await admin.getByRole("row").filter({ hasText: ref }).getByRole("button", { name: `Review deposit ${ref}` }).click();
  const drawer = admin.getByRole("dialog", { name: `Deposit ${ref}` });
  await drawer.getByLabel("The reference, amount, date and method match the bank or broker statement.").check();
  await drawer.getByRole("button", { name: "Verify deposit" }).click();
  await viewer.bringToFront();

  await expect(lane(viewer, team)).toContainText("Rs 133,000,000", { timeout: 5_000 });
  await expect(viewer.getByRole("list", { name: "Live deposits" })).toContainText("+ Rs 123,000,000", { timeout: 5_000 });
  await expect(viewer.getByLabel("Your standing")).toContainText("Rs 133,000,000", { timeout: 5_000 });
  // The celebration plays once, in the team's lane. No client appears anywhere on the page.
  expect(await viewer.evaluate(() => (window as unknown as { __bursts: number }).__bursts)).toBeGreaterThan(0);
  await expect(viewer.getByTestId("burst")).toHaveCount(0, { timeout: 5_000 });
  expect(await viewer.locator("body").innerText()).not.toContain("Pool");
});

test("with reduced motion on, a verified deposit adds no burst element", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await arenaTeam(run, "AR3");
  const client = await readyClient(run, team, null);
  const earlier = await readyClient(`${run}b`, team, null);
  await seedDeposit(team, earlier, 30 * MILLION, `EARLIER-${run}`.toUpperCase(), { verify: true });
  const viewer = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await loginWith(viewer, team.agents[0].email);
  await viewer.goto("/arena");
  await expect(lane(viewer, team)).toContainText("Rs 30,000,000");

  await seedDeposit(team, client, 90 * MILLION, `ARENA-${run}`.toUpperCase(), { verify: true });
  await expect(lane(viewer, team)).toContainText("Rs 120,000,000", { timeout: 8_000 });
  await expect(viewer.getByTestId("burst")).toHaveCount(0);
});

test("reversing a deposit lowers the team total on the Arena", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await arenaTeam(run, "AR4");
  const client = await readyClient(run, team, null);
  const ref = `ARENA-${run}`.toUpperCase();
  await seedDeposit(team, client, 77 * MILLION, ref, { verify: true });
  // A second, smaller deposit keeps the team on the board after the reversal.
  const other = await readyClient(`${run}b`, team, null);
  await seedDeposit(team, other, 5 * MILLION, `SECOND-${run}`.toUpperCase(), { verify: true });

  const viewer = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await loginWith(viewer, team.lead.email);
  await viewer.goto("/arena");
  await expect(lane(viewer, team)).toContainText("Rs 82,000,000");

  const admin = await browser.newPage({ storageState: storageStateFor("admin"), viewport: { width: 1440, height: 900 } });
  await admin.goto("/deposits");
  await admin.getByRole("tab", { name: /Verified/ }).click();
  await admin.getByRole("row").filter({ hasText: ref }).getByRole("button", { name: `Open deposit ${ref}` }).click();
  const drawer = admin.getByRole("dialog", { name: `Deposit ${ref}` });
  await drawer.getByLabel("Reverse this deposit").fill("Client withdrew the money");
  await drawer.getByRole("button", { name: "Reverse deposit" }).click();
  await expect(admin.getByText("Reversed. It no longer counts.")).toBeVisible();

  // A tab in the background pauses its count-up animation, so look at the Arena as the office TV would.
  await viewer.bringToFront();
  // Reversals do not send a feed event, so the Arena finds out on its next pull.
  await expect(lane(viewer, team)).toContainText("Rs 5,000,000", { timeout: 15_000 });
  await expect(lane(viewer, team)).not.toContainText("Rs 82,000,000");
});

test("TV mode shows all four lanes on a 1920 by 1080 screen with no menu, and rotates every 20 seconds", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const teams = await Promise.all(["AR5", "AR6", "AR7", "AR8"].map((l, i) => arenaTeam(run, l, i)));
  for (const [i, team] of teams.entries()) {
    const client = await readyClient(`${run}${i}`, team, null);
    await seedDeposit(team, client, (400 - i * 50) * MILLION, `ARENA-${run}-${i}`.toUpperCase(), { verify: true });
  }

  const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await loginWith(tv, teams[0].lead.email);
  await tv.clock.install();
  await tv.goto("/arena?tv=1");
  await expect(tv.getByRole("heading", { name: "The Arena" })).toBeVisible();

  for (const team of teams) {
    const box = await lane(tv, team).boundingBox();
    expect(box, `${team.name} lane is on screen`).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(1080);
  }
  expect(await tv.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  // No menu, period switch or "You" bar in TV mode.
  await expect(tv.getByRole("navigation")).toHaveCount(0);
  await expect(tv.getByRole("group", { name: "Period" })).toHaveCount(0);
  await expect(tv.getByLabel("Your standing")).toHaveCount(0);

  await expect(tv.getByRole("region", { name: "Top agents" })).toBeVisible();
  await expect(tv.getByRole("region", { name: "Top analysts" })).toHaveCount(0);
  await tv.clock.runFor(20_000);
  await expect(tv.getByRole("region", { name: "Top analysts" })).toBeVisible();
  await expect(tv.getByRole("region", { name: "Top agents" })).toHaveCount(0);
  // The live feed stays on screen in both views.
  await expect(tv.getByRole("region", { name: "Live" })).toBeVisible();
  await tv.clock.runFor(20_000);
  await expect(tv.getByRole("region", { name: "Top agents" })).toBeVisible();
});

test("an analyst can open the Arena but not the team and agent boards", async ({ browser }) => {
  const run = runId();
  const analyst = await makeAnalyst(run, "AR");
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await loginWith(page, analyst.email);
  await page.goto("/arena");
  await expect(page.getByRole("heading", { name: "The Arena" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Team race" })).toBeVisible();

  await page.goto("/leaderboard?board=teams");
  await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
  await page.goto("/leaderboard?board=agents");
  await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
  await page.goto("/leaderboard");
  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Analysts" })).toBeVisible();
});

test("the leaderboard ranks teams and agents, pins the viewer's row, and an Admin sets a team prize shown on the Arena", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await arenaTeam(run, "AR9");
  const client = await readyClient(run, team, null);
  await seedDeposit(team, client, 900 * MILLION, `ARENA-${run}`.toUpperCase(), { verify: true });

  const admin = await browser.newPage({ storageState: storageStateFor("admin"), viewport: { width: 1440, height: 900 } });
  await admin.goto("/prizes");
  await admin.getByLabel(new RegExp(`^Prize for ${team.name}, `)).first().fill("Team dinner");
  await admin.getByRole("button", { name: "Save prizes" }).click();
  await expect(admin.getByText("1 prize saved.")).toBeVisible();
  const { data: audit } = await serviceClient().from("audit_log").select("action").eq("action", "prize.set").eq("meta->>team_id", team.id);
  expect(audit).toHaveLength(1);

  const agent = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await loginWith(agent, team.agents[0].email);
  await agent.goto("/arena");
  await expect(lane(agent, team)).toContainText("Prize: Team dinner");

  await agent.goto("/leaderboard");
  await expect(agent.getByRole("row").filter({ hasText: team.name })).toContainText("Rs 900,000,000");
  await agent.getByRole("tab", { name: "Agents" }).click();
  await expect(agent.getByRole("row").filter({ hasText: team.agents[0].name })).toContainText("Rs 900,000,000");
  await agent.getByRole("tab", { name: "My team" }).click();
  await expect(agent.getByRole("row").filter({ hasText: "(you)" })).toContainText("Rs 900,000,000");

  // Agents cannot open the prize screen.
  await agent.goto("/prizes");
  await expect(agent.getByRole("heading", { name: "No access" })).toBeVisible();
});
