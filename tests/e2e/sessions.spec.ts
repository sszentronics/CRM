import { expect, test } from "@playwright/test";
import { serviceClient } from "./helpers/accounts";
import { expectBrandPage } from "./helpers/brand";
import { loginWith, makeAnalyst, makePoolLeads, makeTeam } from "./helpers/world";

const runId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

test.use({ viewport: { width: 1366, height: 768 } });

async function interestedLead(run: string, teamId: string, agentId: string) {
  const [lead] = await makePoolLeads(run, 1);
  const { error } = await serviceClient()
    .from("leads")
    .update({
      team_id: teamId,
      agent_id: agentId,
      stage: "interested",
      agent_assigned_at: hours(-48),
      last_activity_at: hours(-2),
      next_follow_up_at: hours(24),
    })
    .eq("id", lead.id);
  if (error) throw error;
  return lead;
}

test("agent refers, analyst accepts and schedules, records Attended, and the agent sees the notes", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await makeTeam(run, "S", 1);
  const analyst = await makeAnalyst(run);
  const lead = await interestedLead(run, team.id, team.agents[0].id);
  const name = `Pool ${run} 1`;

  // Agent refers the client to this analyst.
  const agent = await browser.newPage();
  await loginWith(agent, team.agents[0].email);
  await agent.goto(`/lead/${lead.id}`);
  await agent.getByRole("button", { name: "Refer to Technical Analysis" }).click();
  const refer = agent.getByRole("dialog", { name: "Refer to Technical Analysis" });
  await refer.getByRole("radio", { name: new RegExp(analyst.name) }).check();
  await refer.getByText("Video call", { exact: true }).click();
  await refer.getByLabel("Note for the analyst").fill("Wants to understand PSX risk before opening an account");
  await refer.getByRole("button", { name: "Refer", exact: true }).click();
  await expect(agent.getByText("Referred. The analyst has been told and will book a time.")).toBeVisible();
  expect((await serviceClient().from("leads").select("stage, agent_id").eq("id", lead.id).single()).data).toEqual({
    stage: "with_analyst",
    agent_id: team.agents[0].id,
  });

  // Analyst accepts from the queue, then books and records the session on the lead page.
  const ta = await browser.newPage();
  await loginWith(ta, analyst.email);
  await expect(ta).toHaveURL(/\/sessions$/);
  await expectBrandPage(ta);
  await ta.getByRole("button", { name: `Accept the referral for Pool` }).first().click();
  await expect(ta.getByText("Referral accepted. Book the session time next.")).toBeVisible();
  await ta.getByRole("link", { name }).click();
  await expect(ta.getByRole("tab", { name: /Session/, selected: true })).toBeVisible();
  await ta.getByRole("button", { name: "Tomorrow 11 am" }).click();
  await ta.getByRole("button", { name: "Book session" }).click();
  await expect(ta.getByText(/Session booked for tomorrow at 11:00 am\./)).toBeVisible();

  await ta.getByRole("button", { name: "Attended" }).click();
  await ta.getByLabel("Client level").selectOption("Beginner");
  await ta.getByLabel("Interest").selectOption("High");
  await ta.getByLabel(/Notes for the agent/).fill("Explained PSX basics and risk. Comfortable with a small start.");
  await ta.getByLabel(/Next step/).fill("Ready to open a PSX account");
  await ta.getByRole("button", { name: "Save and hand back" }).click();
  await expect(ta.getByText("Handed back. The agent has your notes, and you are credited for this client.")).toBeVisible();
  // The analyst's access ends with the hand-back.
  await ta.goto(`/lead/${lead.id}`);
  await expect(ta.getByRole("heading", { name: "No access" })).toBeVisible();

  expect((await serviceClient().from("leads").select("stage, credited_analyst_id").eq("id", lead.id).single()).data).toEqual({
    stage: "post_session",
    credited_analyst_id: analyst.id,
  });

  // The agent sees the notes and the notification.
  await agent.goto(`/lead/${lead.id}`);
  await agent.getByRole("tab", { name: /Session/ }).click();
  await expect(agent.getByText("Explained PSX basics and risk.", { exact: false })).toBeVisible();
  await expect(agent.getByText("Ready to open a PSX account")).toBeVisible();
  await agent.getByRole("button", { name: /Notifications, \d+ unread/ }).click();
  await expect(agent.getByRole("dialog", { name: "Notifications" }).getByText("Session done")).toBeVisible();
});

test("an interested lead can go straight to documents without any referral", async ({ page }) => {
  const run = runId();
  const team = await makeTeam(run, "D", 1);
  const lead = await interestedLead(run, team.id, team.agents[0].id);

  await loginWith(page, team.agents[0].email);
  await page.goto(`/lead/${lead.id}`);
  await page.getByRole("button", { name: "Start documents" }).click();
  const sheet = page.getByRole("dialog", { name: "Start documents" });
  await sheet.getByRole("button", { name: "In 2 days" }).click();
  await sheet.getByRole("button", { name: "Start documents" }).click();
  await expect(page.getByText(/Moved to Documents pending\./)).toBeVisible();

  const { data } = await serviceClient().from("leads").select("stage").eq("id", lead.id).single();
  expect(data!.stage).toBe("documents_pending");
  const { count } = await serviceClient().from("sessions").select("id", { count: "exact", head: true }).eq("lead_id", lead.id);
  expect(count).toBe(0);
});

test("a no-show keeps the lead with the analyst stage and the agent can cancel and move on", async ({ browser }) => {
  const run = runId();
  const team = await makeTeam(run, "N", 1);
  const analyst = await makeAnalyst(run, "N");
  const lead = await interestedLead(run, team.id, team.agents[0].id);
  const db = serviceClient();

  // Referral straight to the analyst, accepted, then a no-show.
  const agent = await browser.newPage();
  await loginWith(agent, team.agents[0].email);
  await agent.goto(`/lead/${lead.id}`);
  await agent.getByRole("button", { name: "Refer to Technical Analysis" }).click();
  const refer = agent.getByRole("dialog", { name: "Refer to Technical Analysis" });
  await refer.getByRole("radio", { name: new RegExp(analyst.name) }).check();
  await refer.getByLabel("Note for the analyst").fill("Quick intro to commodities");
  await refer.getByRole("button", { name: "Refer", exact: true }).click();
  await expect(agent.getByText(/Referred\./)).toBeVisible();

  const ta = await browser.newPage();
  await loginWith(ta, analyst.email);
  await ta.goto(`/lead/${lead.id}`);
  await ta.getByRole("button", { name: "Accept referral" }).click();
  await expect(ta.getByText("Referral accepted. Book the session time next.")).toBeVisible();
  await ta.getByRole("button", { name: "No-show" }).click();
  await ta.getByRole("button", { name: "Save and hand back" }).click();
  await expect(ta.getByText("Handed back as a no-show. The agent will rebook or move on.")).toBeVisible();

  expect((await db.from("leads").select("stage, credited_analyst_id").eq("id", lead.id).single()).data).toEqual({
    stage: "with_analyst",
    credited_analyst_id: null,
  });

  // The agent can refer again, or book another; here they refer again then cancel back to Interested.
  await agent.goto(`/lead/${lead.id}`);
  await agent.getByRole("tab", { name: /Session/ }).click();
  await agent.getByRole("button", { name: "Refer again" }).click();
  const again = agent.getByRole("dialog", { name: "Refer to Technical Analysis" });
  await again.getByLabel("Note for the analyst").fill("Second try");
  await again.getByRole("button", { name: "Refer", exact: true }).click();
  await expect(agent.getByText(/Referred\./)).toBeVisible();
  await agent.getByRole("button", { name: "Cancel referral" }).click();
  await agent.getByRole("button", { name: "Cancel the referral" }).click();
  await expect(agent.getByText("Referral cancelled. The lead is back to Interested.")).toBeVisible();
  expect((await db.from("leads").select("stage").eq("id", lead.id).single()).data!.stage).toBe("interested");
});
