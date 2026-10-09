import { expect, test, type Page } from "@playwright/test";
import { serviceClient, storageStateFor } from "./helpers/accounts";
import { expectBrandPage } from "./helpers/brand";
import { loginWith, makePoolLeads, makeTeam, type WorldTeam } from "./helpers/world";

const runId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/** Admin screen: tick the run's pool leads and the given teams, preview, confirm. */
async function distribute(page: Page, run: string, teams: WorldTeam[], expected: number) {
  await page.goto(`/distribution?campaign=E2E-${run}`);
  await expectBrandPage(page);
  await page.getByRole("button", { name: `Tick all ${expected} matching` }).click();
  await page.getByRole("button", { name: "None", exact: true }).click();
  for (const t of teams) await page.getByLabel(`Share with ${t.name}`).check();
  await page.getByRole("button", { name: "Distribute evenly" }).click();
  const sheet = page.getByRole("dialog", { name: "Check the split" });
  await expect(sheet).toContainText(`${expected} leads across ${teams.length} teams`);
  await sheet.getByRole("button", { name: `Send ${expected} leads` }).click();
  await expect(page.getByText(`${expected} leads sent to ${teams.length} teams.`)).toBeVisible();
}

/** Team Lead screen: tick every unassigned lead and split it between the chosen people. */
async function splitAll(page: Page, team: WorldTeam, count: number, includeLead: boolean) {
  await loginWith(page, team.lead.email);
  await page.goto("/team/assign");
  await page.getByRole("checkbox", { name: "Tick all shown" }).check();
  await page.getByRole("button", { name: "Split evenly" }).click();
  const sheet = page.getByRole("dialog", { name: "Split evenly" });
  if (includeLead) await sheet.getByRole("checkbox", { name: new RegExp(`${team.lead.name} \\(you\\)`) }).check();
  await sheet.getByRole("button", { name: `Split ${count} leads` }).click();
  await expect(page.getByText(/leads split between/)).toBeVisible();
}

async function countBy(column: "team_id" | "agent_id", ids: string[], leadIds: string[]) {
  const { data } = await serviceClient().from("leads").select(`${column}`).in("id", leadIds);
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const r of (data ?? []) as Record<string, string>[]) if (r[column] in counts) counts[r[column]] += 1;
  return counts;
}

test.describe("distribution", () => {
  test.use({ storageState: storageStateFor("admin") });

  test("Admin distributes, Team Lead splits evenly, and each agent gets a Lead assigned notification", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const run = runId();
    const team = await makeTeam(run, "A", 2);
    const other = await makeTeam(run, "B", 1, 1);
    const leads = await makePoolLeads(run, 8);

    await distribute(page, run, [team, other], 8);
    const perTeam = await countBy("team_id", [team.id, other.id], leads.map((l) => l.id));
    expect(perTeam).toEqual({ [team.id]: 4, [other.id]: 4 });

    const tl = await browser.newPage();
    await splitAll(tl, team, 4, false);
    const perAgent = await countBy("agent_id", team.agents.map((a) => a.id), leads.map((l) => l.id));
    expect(Object.values(perAgent)).toEqual([2, 2]);

    // Both agents were notified; the first sees it in the bell.
    const { data: notes } = await serviceClient()
      .from("notifications")
      .select("user_id, type")
      .in("user_id", team.agents.map((a) => a.id));
    expect(notes!.filter((n) => n.type === "lead_assigned").map((n) => n.user_id).sort()).toEqual(team.agents.map((a) => a.id).sort());

    const agent = await browser.newPage();
    await loginWith(agent, team.agents[0].email);
    await agent.getByRole("button", { name: /Notifications, 1 unread/ }).click();
    const panel = agent.getByRole("dialog", { name: "Notifications" });
    await expect(panel.getByText("Lead assigned")).toBeVisible();
    await expect(panel.getByText("2 new leads assigned to you. First calls due in 24 hours.")).toBeVisible();
  });

  test("reassigning without a reason is blocked", async ({ browser }) => {
    const run = runId();
    const team = await makeTeam(run, "R", 2);
    const leads = await makePoolLeads(run, 1);
    const db = serviceClient();
    await db.from("leads").update({ team_id: team.id, stage: "assigned", agent_id: team.agents[0].id }).eq("id", leads[0].id);

    const page = await browser.newPage();
    await loginWith(page, team.lead.email);
    await page.goto("/team/assign");
    await page.getByRole("tab", { name: /Assigned/ }).click();
    await page.getByRole("checkbox", { name: `Tick Pool ${run} 1` }).check();
    await page.getByLabel("Reassign to").selectOption({ label: team.agents[1].name });
    await page.getByRole("button", { name: /^Reassign 1 lead/ }).click();
    await expect(page.getByText("Give a reason for reassigning a lead.")).toBeVisible();
    const { data } = await db.from("leads").select("agent_id").eq("id", leads[0].id).single();
    expect(data!.agent_id).toBe(team.agents[0].id);

    // With a reason it goes through, and the move is recorded with that reason.
    await page.getByLabel("Reason").fill("Agent on leave");
    await page.getByRole("button", { name: /^Reassign 1 lead/ }).click();
    await expect(page.getByText(/1 lead assigned to/)).toBeVisible();
    const { data: hist } = await db.from("assignments").select("to_user, reason").eq("lead_id", leads[0].id).order("created_at", { ascending: false }).limit(1).single();
    expect(hist).toEqual({ to_user: team.agents[1].id, reason: "Agent on leave" });
  });
});

test("disabling an agent moves their open leads back to the Team Lead's unassigned list", async ({ browser }) => {
  const run = runId();
  const team = await makeTeam(run, "D", 1);
  const leads = await makePoolLeads(run, 2);
  const db = serviceClient();
  await db.from("leads").update({ team_id: team.id, stage: "follow_up", agent_id: team.agents[0].id }).in("id", leads.map((l) => l.id));

  const admin = await browser.newPage({ storageState: storageStateFor("superadmin") });
  await admin.goto("/users");
  await admin.getByLabel("Search people").fill(team.agents[0].name);
  await admin.getByRole("button", { name: `Disable ${team.agents[0].name}` }).click();
  await admin.getByRole("dialog", { name: `Disable ${team.agents[0].name}?` }).getByRole("button", { name: "Disable account" }).click();
  await expect(admin.getByText(/2 open leads went back to the Team Lead\./)).toBeVisible();

  const tl = await browser.newPage();
  await loginWith(tl, team.lead.email);
  await tl.goto("/team/assign");
  const unassigned = tl.getByRole("tabpanel");
  for (const i of [1, 2]) {
    const row = unassigned.getByRole("row").filter({ hasText: `Pool ${run} ${i}` });
    await expect(row).toContainText("Returned");
  }
  await expect(tl.getByRole("button", { name: /Notifications, 1 unread/ })).toBeVisible();
});

test("an agent searching a phone in another team sees only 'Already in the system'", async ({ browser }) => {
  const run = runId();
  const mine = await makeTeam(run, "M", 1);
  const theirs = await makeTeam(run, "T", 1, 2);
  const [lead] = await makePoolLeads(run, 1);
  await serviceClient().from("leads").update({ team_id: theirs.id, stage: "assigned", agent_id: theirs.agents[0].id }).eq("id", lead.id);

  const page = await browser.newPage();
  await loginWith(page, mine.agents[0].email);
  await page.getByRole("combobox", { name: "Search leads by name, phone or CNIC" }).fill(`0${lead.phone.slice(3)}`);
  await expect(page.getByText("Already in the system.")).toBeVisible();
  await expect(page.getByText(`Pool ${run} 1`)).toHaveCount(0);

  await page.goto(`/lead/${lead.id}`);
  await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
});

test("Done when: 200 pool leads reach 12 people in under a minute of clicking", async ({ browser }) => {
  test.setTimeout(240_000);
  const run = runId();
  const teams: WorldTeam[] = [];
  for (const [i, label] of ["F", "M", "S", "L"].entries()) teams.push(await makeTeam(run, label, 2, i));
  const leads = await makePoolLeads(run, 200);
  const ids = leads.map((l) => l.id);

  const started = Date.now();
  const admin = await browser.newPage({ storageState: storageStateFor("admin") });
  await distribute(admin, run, teams, 200);
  const clickTime = Date.now() - started;

  const perTeam = await countBy("team_id", teams.map((t) => t.id), ids);
  expect(Object.values(perTeam)).toEqual([50, 50, 50, 50]);

  let leadTime = 0;
  for (const team of teams) {
    const page = await browser.newPage();
    await loginWith(page, team.lead.email);
    const t0 = Date.now();
    await page.goto("/team/assign");
    await page.getByRole("checkbox", { name: "Tick all shown" }).check();
    await page.getByRole("button", { name: "Split evenly" }).click();
    const sheet = page.getByRole("dialog", { name: "Split evenly" });
    await sheet.getByRole("checkbox", { name: new RegExp(`${team.lead.name} \\(you\\)`) }).check();
    await sheet.getByRole("button", { name: "Split 50 leads" }).click();
    await expect(page.getByText("50 leads split between 3 people.", { exact: false })).toBeVisible();
    leadTime += Date.now() - t0;
    await page.close();
  }

  const people = teams.flatMap((t) => [t.lead.id, ...t.agents.map((a) => a.id)]);
  const perPerson = await countBy("agent_id", people, ids);
  expect(Object.keys(perPerson)).toHaveLength(12);
  expect(Object.values(perPerson).every((n) => n === 16 || n === 17)).toBe(true);
  expect(Object.values(perPerson).reduce((a, b) => a + b, 0)).toBe(200);
  // Admin distribution plus four Team Lead splits, excluding sign-in.
  expect(clickTime + leadTime).toBeLessThan(60_000);
});
