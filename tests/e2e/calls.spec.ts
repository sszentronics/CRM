import { expect, test } from "@playwright/test";
import { serviceClient } from "./helpers/accounts";
import { expectBrandPage } from "./helpers/brand";
import { loginWith, makePoolLeads, makeTeam } from "./helpers/world";

const runId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

/** Give leads to an agent in a stage, as if they had been worked already. */
async function giveTo(ids: string[], teamId: string, agentId: string, patch: Record<string, unknown>) {
  const { error } = await serviceClient()
    .from("leads")
    .update({ team_id: teamId, agent_id: agentId, agent_assigned_at: hours(-48), ...patch })
    .in("id", ids);
  if (error) throw error;
}

async function stageOf(id: string) {
  const { data } = await serviceClient().from("leads").select("stage, agent_id, next_follow_up_at").eq("id", id).single();
  return data!;
}

test.use({ viewport: { width: 1366, height: 768 } });

test("an agent opens a lead, clicks Call and saves a No answer in 3 clicks or fewer", async ({ page }) => {
  const run = runId();
  const team = await makeTeam(run, "C", 1);
  const [lead] = await makePoolLeads(run, 1);
  await giveTo([lead.id], team.id, team.agents[0].id, { stage: "assigned" });

  await loginWith(page, team.agents[0].email);
  await page.goto(`/lead/${lead.id}`);
  await expectBrandPage(page);
  await page.getByRole("button", { name: "Call", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: /Log a call/ });

  let clicks = 0;
  await sheet.getByRole("button", { name: "No answer" }).click();
  clicks++;
  await sheet.getByRole("button", { name: "Save call" }).click();
  clicks++;
  expect(clicks).toBeLessThanOrEqual(3);

  await expect(page.getByText(/Call saved\. Next follow-up today at|Call saved\. Next follow-up tomorrow at/)).toBeVisible();
  expect((await stageOf(lead.id)).stage).toBe("no_answer");
  await expect(page.getByRole("list", { name: "Timeline" })).toContainText("Call: No answer");
});

test("an overdue follow-up appears first, in red, on Today's calls", async ({ page }) => {
  const run = runId();
  const team = await makeTeam(run, "O", 1);
  const [late, soon] = await makePoolLeads(run, 2);
  await giveTo([late.id], team.id, team.agents[0].id, { stage: "follow_up", last_activity_at: hours(-26), next_follow_up_at: hours(-1) });
  await giveTo([soon.id], team.id, team.agents[0].id, { stage: "follow_up", last_activity_at: hours(-26), next_follow_up_at: hours(0.05) });

  await loginWith(page, team.agents[0].email);
  await expect(page).toHaveURL(/\/today$/);
  const first = page.locator("main section").first();
  await expect(first.getByRole("heading")).toHaveText("1 overdue. Start here.");
  const row = first.getByRole("listitem").filter({ hasText: `Pool ${run} 1` });
  await expect(row).toContainText("Overdue");
  const color = await first.getByRole("heading").evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe("rgb(200, 37, 74)");
  await expect(page.getByRole("link", { name: `Pool ${run} 2` })).toBeVisible();
});

test("marking Not interested without a reason is blocked", async ({ page }) => {
  const run = runId();
  const team = await makeTeam(run, "N", 1);
  const [lead] = await makePoolLeads(run, 1);
  await giveTo([lead.id], team.id, team.agents[0].id, { stage: "assigned" });

  await loginWith(page, team.agents[0].email);
  await page.goto(`/lead/${lead.id}`);
  await page.getByRole("button", { name: "Call", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: /Log a call/ });
  await sheet.getByRole("button", { name: "Not interested" }).click();
  await sheet.getByLabel("Notes").fill("Says maybe next year");
  await sheet.getByRole("button", { name: "Save call" }).click();
  await expect(sheet.getByText("Choose a reason.")).toBeVisible();
  expect((await stageOf(lead.id)).stage).toBe("assigned");

  await sheet.getByLabel("Reason").selectOption("Not enough money");
  await sheet.getByRole("button", { name: "Save call" }).click();
  await expect(page.getByText("Call saved. Lead closed: Not enough money.")).toBeVisible();
  expect((await stageOf(lead.id)).stage).toBe("not_interested");
});

test("the Team Lead rejects an Invalid mark and the lead returns to follow-up", async ({ browser }) => {
  const run = runId();
  const team = await makeTeam(run, "I", 1);
  const [lead] = await makePoolLeads(run, 1);
  await giveTo([lead.id], team.id, team.agents[0].id, { stage: "assigned" });

  // The agent marks it invalid.
  const agent = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await loginWith(agent, team.agents[0].email);
  await agent.goto(`/lead/${lead.id}`);
  await agent.getByRole("button", { name: "Call", exact: true }).click();
  const sheet = agent.getByRole("dialog", { name: /Log a call/ });
  await sheet.getByRole("button", { name: "Invalid" }).click();
  await sheet.getByLabel("Reason").selectOption("Wrong number");
  await sheet.getByRole("button", { name: "Save call" }).click();
  await expect(agent.getByText("Marked invalid. Your Team Lead will confirm it.")).toBeVisible();
  await expect(agent.getByText("Waiting for confirmation", { exact: true })).toBeVisible();

  // The Team Lead rejects it.
  const tl = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await loginWith(tl, team.lead.email);
  await tl.goto(`/lead/${lead.id}`);
  await tl.getByRole("button", { name: "Reject, back to follow-up" }).click();
  const reject = tl.getByRole("dialog", { name: "Reject the Invalid mark" });
  await reject.getByRole("button", { name: "Tomorrow 11 am" }).click();
  await reject.getByRole("button", { name: "Reject and send back" }).click();
  await expect(tl.getByText(/Back to follow-up\. Next call tomorrow at 11:00 am\./)).toBeVisible();

  const after = await stageOf(lead.id);
  expect(after.stage).toBe("follow_up");
  expect(after.agent_id).toBe(team.agents[0].id);
  const { data: notes } = await serviceClient()
    .from("notifications")
    .select("type")
    .in("user_id", [team.lead.id, team.agents[0].id]);
  expect(notes!.map((n) => n.type).sort()).toEqual(expect.arrayContaining(["invalid_rejected", "invalid_to_confirm"]));
});

test("an agent opening another team's lead by URL sees No access", async ({ page }) => {
  const run = runId();
  const mine = await makeTeam(run, "X", 1);
  const theirs = await makeTeam(run, "Y", 1, 3);
  const [lead] = await makePoolLeads(run, 1);
  await giveTo([lead.id], theirs.id, theirs.agents[0].id, { stage: "assigned" });

  await loginWith(page, mine.agents[0].email);
  await page.goto(`/lead/${lead.id}`);
  await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
  await expect(page.getByText("This lead belongs to another team.")).toBeVisible();
});

test("the pipeline shows leads by stage and marks stale ones", async ({ page }) => {
  const run = runId();
  const team = await makeTeam(run, "P", 1);
  const [fresh, old] = await makePoolLeads(run, 2);
  await giveTo([fresh.id], team.id, team.agents[0].id, { stage: "interested", last_activity_at: hours(-1), next_follow_up_at: hours(24) });
  await giveTo([old.id], team.id, team.agents[0].id, { stage: "follow_up", last_activity_at: hours(-24 * 10), next_follow_up_at: hours(24) });

  await loginWith(page, team.agents[0].email);
  await page.goto("/pipeline");
  await expect(page.getByRole("heading", { name: "My pipeline" })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Interested, 1$/ })).toContainText(`Pool ${run} 1`);
  const followUp = page.getByRole("region", { name: /^Follow-up, 1$/ });
  await expect(followUp).toContainText(`Pool ${run} 2`);
  await expect(followUp).toContainText("Stale");
});

test("Done when: an agent clears 15 calls without leaving Today's calls", async ({ page }) => {
  test.setTimeout(180_000);
  const run = runId();
  const team = await makeTeam(run, "T", 1);
  const leads = await makePoolLeads(run, 15);
  await giveTo(
    leads.map((l) => l.id),
    team.id,
    team.agents[0].id,
    { stage: "follow_up", last_activity_at: hours(-24), next_follow_up_at: hours(-0.5) },
  );

  await loginWith(page, team.agents[0].email);
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "15 overdue. Start here." })).toBeVisible();

  for (let left = 15; left > 0; left--) {
    await page.getByRole("button", { name: /^Log a call with / }).first().click();
    const sheet = page.getByRole("dialog", { name: /Log a call/ });
    await sheet.getByRole("button", { name: "Follow-up" }).click();
    await sheet.getByRole("button", { name: "Tomorrow 11 am" }).click();
    await sheet.getByRole("button", { name: "Save call" }).click();
    await expect(sheet).toBeHidden();
    if (left > 1) await expect(page.getByRole("button", { name: /^Log a call with / })).toHaveCount(left - 1);
  }

  await expect(page.getByText("All clear. No calls left today.")).toBeVisible();
  await expect(page).toHaveURL(/\/today$/);
  const { data } = await serviceClient().from("activities").select("id").eq("user_id", team.agents[0].id).eq("type", "call");
  expect(data).toHaveLength(15);
});
