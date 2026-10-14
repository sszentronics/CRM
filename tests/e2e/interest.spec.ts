import { expect, test } from "@playwright/test";
import { serviceClient, storageStateFor } from "./helpers/accounts";
import { expectBrandPage } from "./helpers/brand";
import { loginWith, makePoolLeads, makeTeam } from "./helpers/world";

const runId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

test.use({ viewport: { width: 1366, height: 768 } });

test("an agent sets Hot, logs a WhatsApp and the lead shows a green contact chip", async ({ page }) => {
  const run = runId();
  const team = await makeTeam(run, "I", 1);
  const [lead] = await makePoolLeads(run, 1);
  await serviceClient().from("leads").update({ team_id: team.id, agent_id: team.agents[0].id, stage: "assigned" }).eq("id", lead.id);

  await loginWith(page, team.agents[0].email);
  await page.goto(`/lead/${lead.id}`);
  await expectBrandPage(page);
  await expect(page.getByText("Never contacted")).toBeVisible();

  await page.getByLabel("Willingness level").selectOption("hot");
  await expect(page.getByText("Interest set to Hot.").first()).toBeVisible();

  await page.getByRole("button", { name: "Log a message" }).click();
  const sheet = page.getByRole("dialog", { name: /Log a message/ });
  await sheet.getByRole("button", { name: "WhatsApp" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("WhatsApp logged.")).toBeVisible();

  const chip = page.locator("[data-freshness]").first();
  await expect(chip).toHaveAttribute("data-freshness", "green");
  await expect(chip).toContainText("Today · WhatsApp");
  await expect(page.getByRole("list", { name: "Timeline" })).toContainText("Interest set to Hot.");

  const { data } = await serviceClient().from("leads").select("temperature, last_contact_channel").eq("id", lead.id).single();
  expect(data).toEqual({ temperature: "hot", last_contact_channel: "whatsapp" });
});

test("the contact chip is yellow from day 4 and red from day 8", async ({ page }) => {
  const run = runId();
  const team = await makeTeam(run, "F", 1);
  const [a, b] = await makePoolLeads(run, 2);
  const db = serviceClient();
  const mine = { team_id: team.id, agent_id: team.agents[0].id, stage: "assigned" };
  await db.from("leads").update({ ...mine, last_contacted_at: daysAgo(5), last_contact_channel: "call" }).eq("id", a.id);
  await db.from("leads").update({ ...mine, last_contacted_at: daysAgo(9), last_contact_channel: "email" }).eq("id", b.id);

  await loginWith(page, team.agents[0].email);
  await page.goto(`/lead/${a.id}`);
  await expect(page.locator("[data-freshness]").first()).toHaveAttribute("data-freshness", "yellow");
  await expect(page.locator("[data-freshness]").first()).toContainText("5d ago · Call");
  await page.goto(`/lead/${b.id}`);
  await expect(page.locator("[data-freshness]").first()).toHaveAttribute("data-freshness", "red");
  await expect(page.locator("[data-freshness]").first()).toContainText("9d ago · Email");
});

test("an agent cannot set the interest level on another agent's lead", async ({ page }) => {
  const run = runId();
  const team = await makeTeam(run, "X", 2);
  const [lead] = await makePoolLeads(run, 1);
  await serviceClient().from("leads").update({ team_id: team.id, agent_id: team.agents[0].id, stage: "assigned" }).eq("id", lead.id);

  await loginWith(page, team.agents[1].email);
  await page.goto(`/lead/${lead.id}`);
  await expect(page.getByText("This lead belongs to another team.")).toBeVisible();
});

test.describe("owner filters", () => {
  test.use({ storageState: storageStateFor("admin") });

  test("an Admin filters All leads by interest, contact type and last contact", async ({ page }) => {
    const run = runId();
    const team = await makeTeam(run, "O", 1);
    const [hotWa, warmCall, coldOld] = await makePoolLeads(run, 3);
    const db = serviceClient();
    const mine = { team_id: team.id, agent_id: team.agents[0].id, stage: "assigned" };
    await db.from("leads").update({ ...mine, temperature: "hot", last_contacted_at: daysAgo(1), last_contact_channel: "whatsapp" }).eq("id", hotWa.id);
    await db.from("leads").update({ ...mine, temperature: "warm", last_contacted_at: daysAgo(2), last_contact_channel: "call" }).eq("id", warmCall.id);
    await db.from("leads").update({ ...mine, temperature: "cold", last_contacted_at: daysAgo(12), last_contact_channel: "email" }).eq("id", coldOld.id);

    const base = `/leads?team=${team.id}`;
    const names = (n: number) => `Pool ${run} ${n}`;

    await page.goto(`${base}&interest=hot`);
    await expectBrandPage(page);
    const table = page.getByRole("table", { name: "Leads" });
    await expect(table).toContainText(names(1));
    await expect(table).not.toContainText(names(2));
    await expect(table).not.toContainText(names(3));

    await page.goto(`${base}&channel=call`);
    await expect(table).toContainText(names(2));
    await expect(table).not.toContainText(names(1));

    await page.goto(`${base}&contact=red`);
    await expect(table).toContainText(names(3));
    await expect(table).not.toContainText(names(1));

    await page.goto(`${base}&contact=green`);
    await expect(table).toContainText(names(1));
    await expect(table).toContainText(names(2));
    await expect(table).not.toContainText(names(3));

    // The dropdowns drive the same filters.
    await page.goto(base);
    await page.getByRole("combobox", { name: /^Interest/ }).selectOption("warm");
    await expect(page).toHaveURL(/interest=warm/);
    await expect(table).toContainText(names(2));
    await expect(table).not.toContainText(names(1));
  });
});
