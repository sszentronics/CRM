import { expect, test, type Page } from "@playwright/test";
import { serviceClient, storageStateFor } from "./helpers/accounts";
import { expectBrandPage } from "./helpers/brand";
import { loginWith, makeAnalyst, makeBroker, makePoolLeads, makeTeam, type WorldTeam } from "./helpers/world";

const runId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const freshCnic = () => `3${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`;
const freshRef = (run: string, n = 1) => `TXN-${run}-${n}`.toUpperCase();

test.use({ viewport: { width: 1366, height: 768 } });

/** A client in documents with KYC complete and approved, ready for a deposit. */
async function readyClient(run: string, team: WorldTeam, analystId: string | null) {
  const db = serviceClient();
  const broker = await makeBroker(run, ["cnic_front"]);
  const [lead] = await makePoolLeads(run, 1);
  const { error } = await db
    .from("leads")
    .update({
      team_id: team.id,
      agent_id: team.agents[0].id,
      stage: "documents_pending",
      agent_assigned_at: hours(-72),
      last_activity_at: hours(-1),
      next_follow_up_at: hours(24),
      credited_analyst_id: analystId,
    })
    .eq("id", lead.id);
  if (error) throw error;
  const { data: profile, error: kErr } = await db
    .from("kyc_profiles")
    .insert({
      lead_id: lead.id,
      broker_id: broker.id,
      checklist: ["cnic_front"],
      cnic_number: freshCnic(),
      cnic_expiry: new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10),
      mother_name: "Amina Bibi",
      email: "client@example.com",
      bank_name: "Meezan Bank",
      iban: "PK36SCBL0000001123456702",
      income_band: "50k_150k",
      sim_in_own_name: true,
      consent_at: new Date().toISOString(),
      risk_level: "low",
      is_pep: false,
    })
    .select("id")
    .single();
  if (kErr) throw kErr;
  await db.from("documents").insert({ kyc_profile_id: profile!.id, type: "cnic_front", status: "approved" });
  return { lead, broker, name: `Pool ${run} 1` };
}

/** The agent's Deposits tab: open the sheet, fill it and save. */
async function record(page: Page, leadId: string, opts: { amount: string; reference: string; method?: string; button?: string }) {
  await page.goto(`/lead/${leadId}`);
  await page.getByRole("tab", { name: "Deposits" }).click();
  await page.getByRole("tabpanel").getByRole("button", { name: opts.button ?? "Record a deposit" }).click();
  const sheet = page.getByRole("dialog", { name: /Record a (deposit|top-up)/ });
  await sheet.getByLabel("Amount (Rs)").fill(opts.amount);
  if (opts.method) await sheet.getByLabel("How it was paid").selectOption(opts.method);
  await sheet.getByLabel("Bank or transaction reference").fill(opts.reference);
  return sheet;
}

async function verifyAs(admin: Page, reference: string) {
  await admin.goto("/deposits");
  await expectBrandPage(admin);
  const row = admin.getByRole("row").filter({ hasText: reference });
  await row.getByRole("button", { name: `Review deposit ${reference}` }).click();
  const drawer = admin.getByRole("dialog", { name: `Deposit ${reference}` });
  await drawer.getByLabel("The reference, amount, date and method match the bank or broker statement.").check();
  await drawer.getByRole("button", { name: "Verify deposit" }).click();
  await expect(admin.getByText("Verified. It now counts on the boards.")).toBeVisible();
}

test("agent records, Admin verifies, the lead shows deposit_verified, and three people are notified", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await makeTeam(run, "D", 1);
  const analyst = await makeAnalyst(run, "D");
  const { lead, name } = await readyClient(run, team, analyst.id);
  const ref = freshRef(run);

  const agent = await browser.newPage();
  await loginWith(agent, team.agents[0].email);
  const sheet = await record(agent, lead.id, { amount: "250000", reference: ref });
  await expect(sheet.getByText("Rs 250,000")).toBeVisible();
  await expect(sheet.getByText(analyst.name)).toBeVisible();
  await sheet.getByRole("button", { name: "Record deposit" }).click();
  await expect(agent.getByText("Rs 250,000 recorded. An Admin will check it against the statement.")).toBeVisible();
  await expect(agent.getByRole("table", { name: "Deposits" })).toContainText("Waiting for review");

  const db = serviceClient();
  expect((await db.from("leads").select("stage").eq("id", lead.id).single()).data!.stage).toBe("deposit_recorded");

  // Nothing counts yet.
  const { data: before } = await db.from("feed_events").select("id").eq("agent_id", team.agents[0].id);
  expect(before).toHaveLength(0);

  const admin = await browser.newPage({ storageState: storageStateFor("admin"), viewport: { width: 1440, height: 900 } });
  await verifyAs(admin, ref);

  expect((await db.from("leads").select("stage").eq("id", lead.id).single()).data!.stage).toBe("deposit_verified");
  const { data: feed } = await db.from("feed_events").select("amount_pkr, team_id").eq("agent_id", team.agents[0].id);
  expect(feed).toEqual([{ amount_pkr: 250000, team_id: team.id }]);

  const { data: notes } = await db
    .from("notifications")
    .select("user_id, message")
    .eq("type", "deposit_verified")
    .in("user_id", [team.agents[0].id, team.lead.id, analyst.id]);
  expect(notes!.map((n) => n.user_id).sort()).toEqual([team.agents[0].id, team.lead.id, analyst.id].sort());
  // The analyst hears about the money, never the client's name.
  expect(notes!.find((n) => n.user_id === analyst.id)!.message).not.toContain("Pool");

  await agent.reload();
  await expect(agent.getByText("Deposit verified").first()).toBeVisible();
  await agent.getByRole("tab", { name: "Deposits" }).click();
  await expect(agent.getByRole("heading", { name: "Verified total" }).locator("..")).toContainText("Rs 250,000");
  await agent.getByRole("button", { name: /Notifications, \d+ unread/ }).click();
  await expect(agent.getByRole("dialog", { name: "Notifications" }).getByText(`Rs 250,000 from Pool is verified.`)).toBeVisible();
  void name;

  // The analyst's own credit now shows rupees.
  const ta = await browser.newPage();
  await loginWith(ta, analyst.email);
  await expect(ta.getByText("My credit: verified deposits (1 clients credited, 0 sessions held)")).toBeVisible();
  await expect(ta.getByText("Rs 250,000").first()).toBeVisible();
});

test("a top-up on a verified client adds a second deposit and leaves the stage alone", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await makeTeam(run, "T", 1);
  const { lead } = await readyClient(run, team, null);
  const db = serviceClient();
  const first = freshRef(run, 1);
  const second = freshRef(run, 2);

  // The first deposit is already verified.
  const { data: dep } = await db
    .from("deposits")
    .insert({
      lead_id: lead.id,
      broker_id: (await db.from("kyc_profiles").select("broker_id").eq("lead_id", lead.id).single()).data!.broker_id,
      type: "first",
      agent_id: team.agents[0].id,
      team_id: team.id,
      amount_pkr: 100000,
      deposit_date: new Date().toISOString().slice(0, 10),
      method: "bank_transfer",
      reference_no: first,
      created_by: team.agents[0].id,
    })
    .select("id")
    .single();
  await db.from("deposits").update({ status: "verified", verified_at: new Date().toISOString(), verified_by: team.lead.id }).eq("id", dep!.id);
  await db.from("leads").update({ stage: "deposit_verified", next_follow_up_at: null }).eq("id", lead.id);

  const agent = await browser.newPage();
  await loginWith(agent, team.agents[0].email);
  const sheet = await record(agent, lead.id, { amount: "50000", reference: second, button: "Record a top-up" });
  await expect(sheet.getByText("Top-up", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Record deposit" }).click();
  await expect(agent.getByText("Rs 50,000 recorded.")).toBeVisible();

  const admin = await browser.newPage({ storageState: storageStateFor("admin"), viewport: { width: 1440, height: 900 } });
  await verifyAs(admin, second);

  const { data: rows } = await db.from("deposits").select("type, status, amount_pkr").eq("lead_id", lead.id).order("amount_pkr", { ascending: false });
  expect(rows).toEqual([
    { type: "first", status: "verified", amount_pkr: 100000 },
    { type: "top_up", status: "verified", amount_pkr: 50000 },
  ]);
  expect((await db.from("leads").select("stage").eq("id", lead.id).single()).data!.stage).toBe("deposit_verified");
  await agent.reload();
  await agent.getByRole("tab", { name: "Deposits" }).click();
  await expect(agent.getByRole("heading", { name: "Verified total" }).locator("..")).toContainText("Rs 150,000");
});

test("rejecting a first deposit sends the lead back to documents with the reason, and a duplicate reference is refused", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await makeTeam(run, "J", 1);
  const { lead } = await readyClient(run, team, null);
  const ref = freshRef(run);
  const db = serviceClient();

  const agent = await browser.newPage();
  await loginWith(agent, team.agents[0].email);
  const sheet = await record(agent, lead.id, { amount: "30000", method: "cash", reference: ref });
  // Cash above the limit warns the agent before saving.
  await expect(sheet.getByRole("status")).toContainText("Cash above Rs 25,000 is flagged for the Admin");
  await sheet.getByRole("button", { name: "Record deposit" }).click();
  await expect(agent.getByText("Rs 30,000 recorded.")).toBeVisible();
  expect((await db.from("deposits").select("cash_flag").eq("reference_no", ref).single()).data!.cash_flag).toBe(true);

  // The same reference cannot be used again while the first is pending.
  const again = await record(agent, lead.id, { amount: "30000", reference: ref.toLowerCase(), button: "Record a top-up" });
  await again.getByRole("button", { name: "Record deposit" }).click();
  await expect(again.getByText("That reference number has already been used.").first()).toBeVisible();

  const admin = await browser.newPage({ storageState: storageStateFor("admin"), viewport: { width: 1440, height: 900 } });
  await admin.goto("/deposits");
  const row = admin.getByRole("row").filter({ hasText: ref });
  await expect(row).toContainText("Cash above limit");
  await row.getByRole("button", { name: `Review deposit ${ref}` }).click();
  const drawer = admin.getByRole("dialog", { name: `Deposit ${ref}` });
  await drawer.getByLabel("Reject with a reason").fill("Amount does not match the statement");
  await drawer.getByRole("button", { name: "Reject deposit" }).click();
  await expect(admin.getByText("Rejected. The agent has been told why.")).toBeVisible();

  expect((await db.from("leads").select("stage").eq("id", lead.id).single()).data!.stage).toBe("documents_pending");
  await agent.goto(`/lead/${lead.id}`);
  await agent.getByRole("tab", { name: "Deposits" }).click();
  await expect(agent.getByText("Rejected: Amount does not match the statement")).toBeVisible();
  // The rejected reference is free again, so a typing mistake can be corrected.
  const fixed = await record(agent, lead.id, { amount: "30000", method: "bank_transfer", reference: ref });
  await fixed.getByRole("button", { name: "Record deposit" }).click();
  await expect(agent.getByText("Rs 30,000 recorded.")).toBeVisible();
});

test("an Admin reverses a verified deposit and it comes off the total", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await makeTeam(run, "V", 1);
  const { lead } = await readyClient(run, team, null);
  const db = serviceClient();
  const ref = freshRef(run);
  const { data: dep } = await db
    .from("deposits")
    .insert({
      lead_id: lead.id,
      broker_id: (await db.from("kyc_profiles").select("broker_id").eq("lead_id", lead.id).single()).data!.broker_id,
      type: "first",
      agent_id: team.agents[0].id,
      team_id: team.id,
      amount_pkr: 80000,
      deposit_date: new Date().toISOString().slice(0, 10),
      method: "bank_transfer",
      reference_no: ref,
      created_by: team.agents[0].id,
    })
    .select("id")
    .single();
  await db.from("deposits").update({ status: "verified", verified_at: new Date().toISOString(), verified_by: team.lead.id }).eq("id", dep!.id);
  await db.from("leads").update({ stage: "deposit_verified", next_follow_up_at: null }).eq("id", lead.id);

  const admin = await browser.newPage({ storageState: storageStateFor("admin"), viewport: { width: 1440, height: 900 } });
  await admin.goto("/deposits");
  await admin.getByRole("tab", { name: /Verified/ }).click();
  await admin.getByRole("row").filter({ hasText: ref }).getByRole("button", { name: `Open deposit ${ref}` }).click();
  const drawer = admin.getByRole("dialog", { name: `Deposit ${ref}` });
  await drawer.getByRole("button", { name: "Reverse deposit" }).click();
  await expect(drawer.getByText("Give a short reason.")).toBeVisible();
  await drawer.getByLabel("Reverse this deposit").fill("Client withdrew the money");
  await drawer.getByRole("button", { name: "Reverse deposit" }).click();
  await expect(admin.getByText("Reversed. It no longer counts.")).toBeVisible();

  expect((await db.from("deposits").select("status").eq("id", dep!.id).single()).data!.status).toBe("reversed");
  const agent = await browser.newPage();
  await loginWith(agent, team.agents[0].email);
  await agent.goto(`/lead/${lead.id}`);
  await agent.getByRole("tab", { name: "Deposits" }).click();
  await expect(agent.getByRole("heading", { name: "Verified total" }).locator("..")).toContainText("Rs 0");
  await expect(agent.getByText("Reversed: Client withdrew the money")).toBeVisible();
});

test("an analyst never sees deposits, and the deposits screen is closed to agents", async ({ browser }) => {
  const run = runId();
  const team = await makeTeam(run, "X", 1);
  const analyst = await makeAnalyst(run, "X");
  const { lead } = await readyClient(run, team, analyst.id);
  const agent = await browser.newPage();
  await loginWith(agent, team.agents[0].email);
  await agent.goto("/deposits");
  await expect(agent.getByRole("heading", { name: "No access" })).toBeVisible();

  const ta = await browser.newPage();
  await loginWith(ta, analyst.email);
  await ta.goto("/deposits");
  await expect(ta.getByRole("heading", { name: "No access" })).toBeVisible();
  void lead;
});

test("Done when: a new lead reaches a verified deposit through the screens, in one spec", async ({ browser }) => {
  test.setTimeout(240_000);
  const run = runId();
  const campaign = `E2E-${run}`;
  const team = await makeTeam(run, "G", 1);
  const analyst = await makeAnalyst(run, "G");
  const broker = await makeBroker(run, ["cnic_front", "cnic_back"]);
  const db = serviceClient();
  const local = `0345${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
  const name = `Golden ${run}`;
  const cnic = freshCnic();
  const ref = freshRef(run);

  // 1. The Superadmin adds the lead, then the Admin sends it to the team.
  const sa = await browser.newPage({ storageState: storageStateFor("superadmin"), viewport: { width: 1440, height: 900 } });
  await sa.goto("/leads/add");
  await sa.getByLabel("Full name").fill(name);
  await sa.getByLabel("Phone", { exact: true }).fill(local);
  await sa.getByLabel("Source").selectOption({ label: "Facebook" });
  await sa.getByLabel("Campaign").fill(campaign);
  await sa.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sa.getByRole("heading", { name, level: 1 })).toBeVisible();

  const admin = await browser.newPage({ storageState: storageStateFor("admin"), viewport: { width: 1440, height: 900 } });
  await admin.goto(`/distribution?campaign=${campaign}`);
  await admin.getByRole("button", { name: "Tick all 1 matching" }).click();
  await admin.getByRole("button", { name: "None", exact: true }).click();
  await admin.getByLabel(`Share with ${team.name}`).check();
  await admin.getByRole("button", { name: "Distribute evenly" }).click();
  await admin.getByRole("dialog", { name: "Check the split" }).getByRole("button", { name: /^Send 1 lead/ }).click();
  await expect(admin.getByText(/1 lead sent to 1 team/)).toBeVisible();

  // 2. The Team Lead hands it to the agent.
  const tl = await browser.newPage();
  await loginWith(tl, team.lead.email);
  await tl.goto("/team/assign");
  await tl.getByRole("checkbox", { name: "Tick all shown" }).check();
  await tl.getByRole("button", { name: "Split evenly" }).click();
  const split = tl.getByRole("dialog", { name: "Split evenly" });
  await split.getByRole("button", { name: /^Split 1 lead/ }).click();
  await expect(tl.getByText(/leads? split between/)).toBeVisible();
  const { data: created } = await db.from("leads").select("id, agent_id").eq("campaign", campaign).single();
  expect(created!.agent_id).toBe(team.agents[0].id);
  const leadId = created!.id as string;

  // 3. The agent calls: interested, then refers the client to the analyst.
  const agent = await browser.newPage();
  await loginWith(agent, team.agents[0].email);
  await agent.goto(`/lead/${leadId}`);
  await agent.getByRole("button", { name: "Call", exact: true }).click();
  const call = agent.getByRole("dialog", { name: /Log a call/ });
  await call.getByRole("button", { name: "Interested", exact: true }).click();
  await call.getByLabel("Notes", { exact: true }).fill("Keen to start with PSX stocks");
  await call.getByRole("button", { name: "In 2 days" }).click();
  await call.getByRole("button", { name: "Save call" }).click();
  await expect(agent.getByText(/Call saved\./)).toBeVisible();

  await agent.getByRole("button", { name: "Refer to Technical Analysis" }).click();
  const refer = agent.getByRole("dialog", { name: "Refer to Technical Analysis" });
  await refer.getByRole("radio", { name: new RegExp(analyst.name) }).check();
  await refer.getByLabel("Note for the analyst").fill("Wants to start with PSX stocks");
  await refer.getByRole("button", { name: "Refer", exact: true }).click();
  await expect(agent.getByText(/Referred\./)).toBeVisible();

  // 4. The analyst accepts, books and gives the session.
  const ta = await browser.newPage();
  await loginWith(ta, analyst.email);
  await ta.getByRole("button", { name: "Accept the referral for Golden" }).first().click();
  await expect(ta.getByText("Referral accepted. Book the session time next.")).toBeVisible();
  await ta.getByRole("link", { name }).click();
  await ta.getByRole("button", { name: "Tomorrow 11 am" }).click();
  await ta.getByRole("button", { name: "Book session" }).click();
  await expect(ta.getByText(/Session booked for tomorrow at 11:00 am\./)).toBeVisible();
  await ta.getByRole("button", { name: "Attended" }).click();
  await ta.getByLabel("Client level").selectOption("Beginner");
  await ta.getByLabel("Interest").selectOption("High");
  await ta.getByLabel(/Notes for the agent/).fill("Explained the basics. Ready to open an account.");
  await ta.getByLabel(/Next step/).fill("Open a PSX account");
  await ta.getByRole("button", { name: "Save and hand back" }).click();
  await expect(ta.getByText(/Handed back\./)).toBeVisible();

  // 5. The agent starts documents, picks the broker, ticks the items and types the details.
  await agent.goto(`/lead/${leadId}`);
  await agent.getByRole("button", { name: "Start documents" }).click();
  const start = agent.getByRole("dialog", { name: "Start documents" });
  await start.getByRole("button", { name: "In 2 days" }).click();
  await start.getByRole("button", { name: "Start documents" }).click();
  await expect(agent.getByText(/Moved to Documents pending\./)).toBeVisible();
  await agent.getByRole("tab", { name: "Documents" }).click();
  await agent.getByLabel("Broker").selectOption({ label: `${broker.name} (PSX)` });
  await agent.getByRole("button", { name: "Start with this broker" }).click();
  await expect(agent.getByText(`${broker.name} chosen. Its checklist is below.`)).toBeVisible();
  await agent.getByRole("button", { name: "Mark collected: CNIC front" }).click();
  await expect(agent.getByText(/Marked collected/).first()).toBeVisible();
  await agent.getByRole("button", { name: "Mark collected: CNIC back" }).click();
  await expect(agent.getByRole("list", { name: "Document checklist" })).not.toContainText("Not collected");
  await agent.getByLabel("CNIC number").fill(cnic);
  await agent.getByLabel("CNIC expiry").fill(new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10));
  await agent.getByLabel("Mother's name").fill("Amina Bibi");
  await agent.getByLabel("Email", { exact: true }).fill("golden@example.com");
  await agent.getByLabel("Bank", { exact: true }).fill("Meezan Bank");
  await agent.getByLabel("IBAN").fill("PK36 SCBL 0000 0011 2345 6702");
  await agent.getByLabel("Monthly income").selectOption({ index: 2 });
  await agent.getByLabel("Risk level").selectOption("Low");
  await agent.getByLabel("Politically exposed person").selectOption("No");
  await agent.getByLabel("The phone number's SIM is registered in the client's own name").check();
  await agent.getByLabel("The client agreed to share these details with the broker").check();
  await agent.getByRole("button", { name: "Save details" }).click();
  await expect(agent.getByText(/KYC details saved/)).toBeVisible();

  // 6. Deposits stay locked until the Admin approves the documents; then the agent records the money.
  await admin.goto("/documents");
  await admin.getByRole("row").filter({ hasText: name }).getByRole("button", { name: `Review ${name}` }).click();
  await admin.getByRole("dialog", { name }).getByRole("button", { name: "Approve all 2 waiting" }).click();
  await expect(admin.getByText("2 documents approved.")).toBeVisible();

  await agent.goto(`/lead/${leadId}`);
  await agent.getByRole("tab", { name: "Deposits" }).click();
  await agent.getByRole("tabpanel").getByRole("button", { name: "Record a deposit" }).click();
  const dep = agent.getByRole("dialog", { name: "Record a deposit" });
  await dep.getByLabel("Amount (Rs)").fill("500000");
  await dep.getByLabel("Bank or transaction reference").fill(ref);
  await dep.getByRole("button", { name: "Record deposit" }).click();
  await expect(agent.getByText("Rs 500,000 recorded.")).toBeVisible();

  // 7. The Admin verifies against the statement. The lead is a funded client.
  await verifyAs(admin, ref);
  const { data: final } = await db.from("leads").select("stage, credited_analyst_id").eq("id", leadId).single();
  expect(final).toEqual({ stage: "deposit_verified", credited_analyst_id: analyst.id });
  const { data: deposit } = await db.from("deposits").select("status, type, amount_pkr, team_id, credited_analyst_id").eq("reference_no", ref).single();
  expect(deposit).toEqual({ status: "verified", type: "first", amount_pkr: 500000, team_id: team.id, credited_analyst_id: analyst.id });
  const { data: feed } = await db.from("feed_events").select("*").eq("agent_id", team.agents[0].id);
  expect(feed).toHaveLength(1);
  expect(Object.keys(feed![0])).not.toContain("lead_id");

  // 8. The Arena shows the win, and never the client.
  await agent.goto("/arena");
  await expect(agent.getByRole("heading", { name: "The Arena" })).toBeVisible();
  const live = agent.getByRole("list", { name: "Live deposits" });
  await expect(live).toContainText("+ Rs 500,000");
  await expect(live).toContainText(team.agents[0].name.split(" ")[0]);
  expect(await agent.locator("body").innerText()).not.toContain(name);
});
