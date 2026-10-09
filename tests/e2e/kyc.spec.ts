import { expect, test, type Page } from "@playwright/test";
import { serviceClient, storageStateFor } from "./helpers/accounts";
import { expectBrandPage } from "./helpers/brand";
import { loginWith, makeBroker, makePoolLeads, makeTeam } from "./helpers/world";

const runId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
/** A CNIC no other test client uses. */
const freshCnic = () => `3${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`;

test.use({ viewport: { width: 1366, height: 768 } });

async function documentsLead(run: string, teamId: string, agentId: string) {
  const [lead] = await makePoolLeads(run, 1);
  const { error } = await serviceClient()
    .from("leads")
    .update({ team_id: teamId, agent_id: agentId, stage: "documents_pending", agent_assigned_at: hours(-72), last_activity_at: hours(-1), next_follow_up_at: hours(24) })
    .eq("id", lead.id);
  if (error) throw error;
  return lead;
}

async function fillDetails(page: Page, cnic: string) {
  await page.getByLabel("CNIC number").fill(cnic);
  const expiry = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("CNIC expiry").fill(expiry);
  await page.getByLabel("Mother's name").fill("Amina Bibi");
  await page.getByLabel("Email", { exact: true }).fill("client@example.com");
  await page.getByLabel("Bank", { exact: true }).fill("Meezan Bank");
  await page.getByLabel("IBAN").fill("PK36 SCBL 0000 0011 2345 6702");
  await page.getByLabel("Monthly income").selectOption({ index: 2 });
  await page.getByLabel("Risk level").selectOption("Low");
  await page.getByLabel("Politically exposed person").selectOption("No");
  await page.getByLabel("The phone number's SIM is registered in the client's own name").check();
  await page.getByLabel("The client agreed to share these details with the broker").check();
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText(/KYC details saved/)).toBeVisible();
}

test("Done when: a full KYC set is collected on the lead page and reviewed by the Admin", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await makeTeam(run, "K", 1);
  const broker = await makeBroker(run);
  const lead = await documentsLead(run, team.id, team.agents[0].id);
  const name = `Pool ${run} 1`;
  const cnic = freshCnic();

  const agent = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await loginWith(agent, team.agents[0].email);
  await agent.goto(`/lead/${lead.id}`);
  await agent.getByRole("tab", { name: "Documents" }).click();
  await expectBrandPage(agent);

  await agent.getByLabel("Broker").selectOption({ label: `${broker.name} (PSX)` });
  await agent.getByRole("button", { name: "Start with this broker" }).click();
  await expect(agent.getByText(`${broker.name} chosen. Its checklist is below.`)).toBeVisible();

  // "Record a deposit" stays disabled until every item and field is complete.
  const record = agent.getByRole("tabpanel").getByRole("button", { name: "Record a deposit", exact: true });
  await expect(record).toBeDisabled();
  await agent.getByRole("button", { name: "Mark collected: CNIC front" }).click();
  await expect(agent.getByText(/Marked collected/).first()).toBeVisible();
  await agent.getByRole("button", { name: "Mark collected: CNIC back" }).click();
  await expect(agent.getByRole("list", { name: "Document checklist" })).not.toContainText("Not collected");
  await expect(record).toBeDisabled();
  await fillDetails(agent, cnic);
  await expect(record).toBeEnabled();

  // The Admin reviews on the desktop review screen.
  const admin = await browser.newPage({ viewport: { width: 1440, height: 900 }, storageState: storageStateFor("admin") });
  await admin.goto("/documents");
  await expectBrandPage(admin);
  const row = admin.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText(`•••• ${cnic.slice(-4)}`);
  await row.getByRole("button", { name: `Review ${name}` }).click();
  const drawer = admin.getByRole("dialog", { name });
  await expect(drawer).toContainText(`${cnic.slice(0, 5)}-${cnic.slice(5, 12)}-${cnic.slice(12)}`);
  await drawer.getByRole("button", { name: "Approve all 2 waiting" }).click();
  await expect(admin.getByText("2 documents approved.")).toBeVisible();

  const db = serviceClient();
  const { data: profile } = await db.from("kyc_profiles").select("id, status").eq("lead_id", lead.id).single();
  expect(profile!.status).toBe("approved");
  const { data: docs } = await db.from("documents").select("id").eq("kyc_profile_id", profile!.id);
  const { data: audit } = await db.from("audit_log").select("entity_id").eq("action", "document.collected").in("entity_id", docs!.map((d) => d.id));
  expect(audit).toHaveLength(2);

  // Approved items are locked for the agent: no tick controls remain.
  await agent.reload();
  await agent.getByRole("tab", { name: "Documents" }).click();
  await expect(agent.getByRole("button", { name: /Mark collected|Clear tick/ })).toHaveCount(0);
  await expect(agent.getByText("These details are approved and locked. An Admin can change them.")).toBeVisible();
});

test("reviewing a document as Admin writes an audit row with the document id", async ({ browser }) => {
  const run = runId();
  const team = await makeTeam(run, "A", 1);
  const broker = await makeBroker(run, ["cnic_front"]);
  const lead = await documentsLead(run, team.id, team.agents[0].id);
  const db = serviceClient();
  const { data: profile } = await db
    .from("kyc_profiles")
    .insert({ lead_id: lead.id, broker_id: broker.id, checklist: ["cnic_front"] })
    .select("id")
    .single();
  const { data: doc } = await db.from("documents").insert({ kyc_profile_id: profile!.id, type: "cnic_front", status: "collected" }).select("id").single();

  const admin = await browser.newPage({ viewport: { width: 1440, height: 900 }, storageState: storageStateFor("admin") });
  await admin.goto(`/lead/${lead.id}`);
  await admin.getByRole("tab", { name: "Documents" }).click();
  await admin.getByRole("button", { name: "Approve CNIC front" }).click();
  await expect(admin.getByText("Approved.", { exact: true })).toBeVisible();

  const { data: audit } = await db.from("audit_log").select("entity_id, action").eq("entity_id", doc!.id).eq("action", "document.approved");
  expect(audit).toHaveLength(1);
});

test("a rejected item shows its reason in red and appears on the agent's Today's calls", async ({ browser }) => {
  const run = runId();
  const team = await makeTeam(run, "R", 1);
  const broker = await makeBroker(run, ["cnic_front"]);
  const lead = await documentsLead(run, team.id, team.agents[0].id);
  const db = serviceClient();
  const { data: profile } = await db.from("kyc_profiles").insert({ lead_id: lead.id, broker_id: broker.id, checklist: ["cnic_front"] }).select("id").single();
  await db.from("documents").insert({ kyc_profile_id: profile!.id, type: "cnic_front", status: "collected" });

  const admin = await browser.newPage({ viewport: { width: 1440, height: 900 }, storageState: storageStateFor("admin") });
  await admin.goto(`/lead/${lead.id}`);
  await admin.getByRole("tab", { name: "Documents" }).click();
  await admin.getByRole("button", { name: "Reject CNIC front" }).click();
  await admin.getByLabel("Reason for rejecting CNIC front").fill("Blurry, retake it");
  await admin.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(admin.getByText("Rejected. The agent has been told why.")).toBeVisible();

  const agent = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await loginWith(agent, team.agents[0].email);
  await expect(agent).toHaveURL(/\/today$/);
  const section = agent.getByRole("region", { name: "Documents to fix" });
  await expect(section).toContainText(`Pool ${run} 1: CNIC front`);
  const reason = section.getByText("Rejected: Blurry, retake it");
  await expect(reason).toBeVisible();
  expect(await reason.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(200, 37, 74)");
});

test("a CNIC finds the client from the search box", async ({ page }) => {
  const run = runId();
  const team = await makeTeam(run, "Q", 1);
  const broker = await makeBroker(run, ["cnic_front"]);
  const lead = await documentsLead(run, team.id, team.agents[0].id);
  const cnic = freshCnic();
  await serviceClient().from("kyc_profiles").insert({ lead_id: lead.id, broker_id: broker.id, checklist: ["cnic_front"], cnic_number: cnic });

  await loginWith(page, team.agents[0].email);
  await page.getByRole("combobox", { name: "Search leads by name, phone or CNIC" }).fill(`${cnic.slice(0, 5)}-${cnic.slice(5, 12)}-${cnic.slice(12)}`);
  await expect(page.getByRole("option", { name: new RegExp(`Pool ${run} 1`) })).toBeVisible();
});
