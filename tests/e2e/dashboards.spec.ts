import { expect, test } from "@playwright/test";
import { serviceClient, storageStateFor } from "./helpers/accounts";
import { readyClient, seedDeposit } from "./helpers/deposits";
import { loginWith, makeAnalyst, makePoolLeads, makeTeam } from "./helpers/world";

const runId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

test.use({ viewport: { width: 1440, height: 900 } });

test("the Team dashboard total equals that team's Arena total, and shows only their own agents", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await makeTeam(run, "DB1", 2);
  const other = await makeTeam(run, "DB2", 1, 1);
  const client = await readyClient(run, team, null);
  // A large amount keeps the team in the Arena's leading lanes however many teams exist.
  await seedDeposit(team, client, 950_000_000, `DASH-${run}`.toUpperCase(), { verify: true });
  const db = serviceClient();
  await db.from("targets").upsert({ team_id: team.id, month: new Date().toISOString().slice(0, 7) + "-01", amount_pkr: 1_000_000_000 }, { onConflict: "team_id,month" });
  await db.from("team_prizes").upsert({ team_id: team.id, month: new Date().toISOString().slice(0, 7) + "-01", prize: "Team trip" }, { onConflict: "team_id,month" });

  const tl = await browser.newPage();
  await loginWith(tl, team.lead.email);
  await expect(tl).toHaveURL(/\/team$/);
  await expect(tl.getByRole("heading", { name: "Team dashboard" })).toBeVisible();
  const banner = tl.getByLabel("Team standing");
  await expect(banner).toContainText("Rs 950,000,000");
  await expect(banner).toContainText("95% of the Rs 1,000,000,000 target");
  await expect(banner).toContainText("Prize for reaching the target: Team trip");

  // Only this team's agents are listed.
  const table = tl.getByRole("table", { name: "Agents on the team" });
  await expect(table).toContainText(team.agents[0].name);
  await expect(table).toContainText(team.agents[1].name);
  await expect(table).not.toContainText(other.agents[0].name);

  // The Arena shows the same total for the same month.
  await tl.goto("/arena");
  await expect(tl.getByRole("listitem", { name: new RegExp(`^${team.name}, rank`) })).toContainText("Rs 950,000,000");

  await db.from("teams").update({ is_active: false }).in("id", [team.id, other.id]);
});

test("a deposit pending for 25 hours turns the Deposits to verify tile red", async ({ browser }) => {
  const run = runId();
  const team = await makeTeam(run, "DB3", 1);
  const client = await readyClient(run, team, null);
  const db = serviceClient();
  const id = await seedDeposit(team, client, 12_345, `LATE-${run}`.toUpperCase());
  await db.from("deposits").update({ created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq("id", id);

  const admin = await browser.newPage({ storageState: storageStateFor("admin") });
  await admin.goto("/work-queue");
  const tile = admin.getByRole("link", { name: /Deposits to verify/ });
  await expect(tile).toBeVisible();
  await expect(tile).toContainText("overdue");
  // The left edge is the danger colour, and the colour is never the only signal.
  expect(await tile.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe("rgb(200, 37, 74)");
  await tile.click();
  await expect(admin).toHaveURL(/\/deposits$/);

  await db.from("deposits").update({ status: "rejected", reject_reason: "Test clean-up" }).eq("id", id);
});

test("tapping a notification opens the lead and marks it read; Mark all as read clears the rest", async ({ browser }) => {
  const run = runId();
  const team = await makeTeam(run, "DB4", 1);
  const [lead] = await makePoolLeads(run, 1);
  const db = serviceClient();
  await db.from("leads").update({ team_id: team.id, agent_id: team.agents[0].id, stage: "assigned" }).eq("id", lead.id);
  const rows = [
    { user_id: team.agents[0].id, type: "lead_note", message: "Note from your Team Lead: call back today", link: `/lead/${lead.id}` },
    { user_id: team.agents[0].id, type: "lead_assigned", message: "1 new lead assigned to you.", link: "/today" },
  ];
  await db.from("notifications").insert(rows);

  const agent = await browser.newPage();
  await loginWith(agent, team.agents[0].email);
  await agent.goto("/notifications");
  await expect(agent.getByRole("tab", { name: /Unread/ })).toContainText("2");
  await agent.getByRole("button", { name: /Note from your Team Lead/ }).click();
  await expect(agent).toHaveURL(new RegExp(`/lead/${lead.id}$`));
  const { data: read } = await db.from("notifications").select("read_at").eq("user_id", team.agents[0].id).eq("type", "lead_note").single();
  expect(read!.read_at).not.toBeNull();

  await agent.goto("/notifications");
  await agent.getByRole("tab", { name: /Unread/ }).click();
  await expect(agent.getByRole("list", { name: "Notifications" })).toContainText("1 new lead assigned to you.");
  await expect(agent.getByRole("list", { name: "Notifications" })).not.toContainText("call back today");
  await agent.getByRole("button", { name: "Mark all as read" }).click();
  await expect(agent.getByText("You are all caught up.")).toBeVisible();
  const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", team.agents[0].id).is("read_at", null);
  expect(count).toBe(0);
});

test("each of the five roles lands on a finished home screen", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await makeTeam(run, "DB5", 1);
  const analyst = await makeAnalyst(run, "DB");

  const agent = await browser.newPage();
  await loginWith(agent, team.agents[0].email);
  await expect(agent).toHaveURL(/\/today$/);
  await expect(agent.getByText("This screen is on its way.")).toHaveCount(0);

  const tl = await browser.newPage();
  await loginWith(tl, team.lead.email);
  await expect(tl).toHaveURL(/\/team$/);
  await expect(tl.getByRole("region", { name: "Team tiles" })).toBeVisible();
  await expect(tl.getByText("This screen is on its way.")).toHaveCount(0);

  const ta = await browser.newPage();
  await loginWith(ta, analyst.email);
  await expect(ta).toHaveURL(/\/sessions$/);
  await expect(ta.getByText("This screen is on its way.")).toHaveCount(0);

  const admin = await browser.newPage({ storageState: storageStateFor("admin") });
  await admin.goto("/work-queue");
  await expect(admin.getByRole("region", { name: "Queues" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Needs a look" })).toBeVisible();

  const owner = await browser.newPage({ storageState: storageStateFor("superadmin") });
  await owner.goto("/dashboard");
  await expect(owner.getByRole("region", { name: "Headline" })).toBeVisible();
  for (const name of ["Team ranking", "Funnel", "Where the money comes from", "By broker", "Live", "Needs attention"]) {
    await expect(owner.getByRole("heading", { name })).toBeVisible();
  }
  // The period switch changes the view.
  await owner.getByRole("link", { name: "Today" }).click();
  await expect(owner).toHaveURL(/period=today/);

  // An agent cannot open the other homes.
  await agent.goto("/work-queue");
  await expect(agent.getByRole("heading", { name: "No access" })).toBeVisible();
  await agent.goto("/dashboard");
  await expect(agent.getByRole("heading", { name: "No access" })).toBeVisible();
});
