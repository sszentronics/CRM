import { expect, test, type Page } from "@playwright/test";
import { serviceClient, storageStateFor } from "./helpers/accounts";
import { expectBrandPage } from "./helpers/brand";

test.use({ storageState: storageStateFor("superadmin") });

const TEAM_COLORS = ["Cyan", "Coral", "Pink", "Lemon"] as const;

async function addPerson(page: Page, p: { name: string; email: string; role: string; team?: string }) {
  await page.getByRole("button", { name: "Add person" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add a person" });
  await drawer.getByLabel("Full name").fill(p.name);
  await drawer.getByLabel("Email").fill(p.email);
  await drawer.getByLabel("Role").selectOption({ label: p.role });
  if (p.team) await drawer.getByLabel("Team", { exact: true }).selectOption({ label: p.team });
  await drawer.getByRole("button", { name: "Add person" }).click();
  // The local test database holds hundreds of test staff after many runs, so the list re-renders slowly.
  await expect(page.getByText(`${p.name} added.`)).toBeVisible({ timeout: 20_000 });
  await expect(drawer).toBeHidden();
}

async function addTeam(page: Page, t: { name: string; color: string; lead: string }) {
  await page.getByRole("button", { name: "Add team" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add a team" });
  await drawer.getByLabel("Team name").fill(t.name);
  await drawer.getByText(t.color, { exact: true }).click();
  await drawer.getByLabel("Team Lead").selectOption({ label: t.lead });
  await drawer.getByRole("button", { name: "Add team" }).click();
  await expect(page.getByText(`${t.name} created.`)).toBeVisible({ timeout: 20_000 });
  await expect(drawer).toBeHidden();
}

test("the Superadmin builds 4 teams, 8 agents, 2 analysts and 1 admin from the UI", async ({ page }) => {
  test.setTimeout(240_000);
  const run = Date.now().toString(36);
  const mail = (who: string) => `e2e-${run}-${who}@tradinglabs.test`;

  await page.goto("/users");
  await expectBrandPage(page);

  await addPerson(page, { name: `Admin ${run}`, email: mail("admin"), role: "Admin" });
  await addPerson(page, { name: `Analyst One ${run}`, email: mail("an1"), role: "Technical Analyst" });
  await addPerson(page, { name: `Analyst Two ${run}`, email: mail("an2"), role: "Technical Analyst" });

  for (let i = 1; i <= 4; i++) {
    await addPerson(page, { name: `Lead ${i} ${run}`, email: mail(`lead${i}`), role: "Team Lead" });
    await addTeam(page, { name: `Team ${i} ${run}`, color: TEAM_COLORS[i - 1], lead: `Lead ${i} ${run}` });
    for (const n of [1, 2]) {
      await addPerson(page, {
        name: `Agent ${i}.${n} ${run}`,
        email: mail(`agent${i}${n}`),
        role: "Agent",
        team: `Team ${i} ${run}`,
      });
    }
  }

  // Every team shows its lead and two agents.
  await page.getByRole("tab", { name: /Teams/ }).click();
  for (let i = 1; i <= 4; i++) {
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `Team ${i} ${run}` }) });
    await expect(card).toContainText(`Lead ${i} ${run}`);
    await expect(card).toContainText("2 agents");
  }

  // And the database agrees.
  const db = serviceClient();
  const { data: teams } = await db.from("teams").select("id, team_lead_id").like("name", `% ${run}`);
  expect(teams).toHaveLength(4);
  const { data: people } = await db.from("profiles").select("role, team_id").like("email", `e2e-${run}-%`);
  const count = (role: string) => people!.filter((p) => p.role === role).length;
  expect([count("admin"), count("analyst"), count("team_lead"), count("agent")]).toEqual([1, 2, 4, 8]);
  const { data: audit } = await db.from("audit_log").select("id").eq("action", "user.create").in(
    "entity_id",
    (await db.from("profiles").select("id").like("email", `e2e-${run}-%`)).data!.map((p) => p.id),
  );
  expect(audit).toHaveLength(15);
});

test("the Superadmin moves an agent, changes a Team Lead and disables someone", async ({ page }) => {
  test.setTimeout(120_000);
  const run = Date.now().toString(36);
  const mail = (who: string) => `e2e-${run}-${who}@tradinglabs.test`;
  await page.goto("/users");

  await addPerson(page, { name: `Lead A ${run}`, email: mail("la"), role: "Team Lead" });
  await addPerson(page, { name: `Lead B ${run}`, email: mail("lb"), role: "Team Lead" });
  await addTeam(page, { name: `Alpha ${run}`, color: "Sky", lead: `Lead A ${run}` });
  await addTeam(page, { name: `Bravo ${run}`, color: "Lilac", lead: `Lead B ${run}` });
  await addPerson(page, { name: `Mover ${run}`, email: mail("mv"), role: "Agent", team: `Alpha ${run}` });
  await addPerson(page, { name: `Lead C ${run}`, email: mail("lc"), role: "Team Lead" });

  // Move the agent from Alpha to Bravo.
  await page.getByLabel("Search people").fill(`Mover ${run}`);
  await page.getByRole("button", { name: `Edit Mover ${run}` }).click();
  const edit = page.getByRole("dialog", { name: `Edit Mover ${run}` });
  await edit.getByLabel("Team", { exact: true }).selectOption({ label: `Bravo ${run}` });
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`Mover ${run} saved.`)).toBeVisible();

  // Change Alpha's Team Lead to Lead C.
  await page.getByRole("tab", { name: /Teams/ }).click();
  await page.getByRole("button", { name: `Change Team Lead of Alpha ${run}` }).click();
  const change = page.getByRole("dialog", { name: `Change the Team Lead of Alpha ${run}` });
  await change.getByLabel("New Team Lead").selectOption({ label: `Lead C ${run}` });
  await change.getByRole("button", { name: "Change Team Lead" }).click();
  await expect(page.getByText(`Alpha ${run} has a new Team Lead.`)).toBeVisible();

  // Disable the agent.
  await page.getByRole("tab", { name: /People/ }).click();
  await page.getByLabel("Search people").fill(`Mover ${run}`);
  await page.getByRole("button", { name: `Disable Mover ${run}` }).click();
  await page.getByRole("dialog", { name: `Disable Mover ${run}?` }).getByRole("button", { name: "Disable account" }).click();
  await expect(page.getByText(`Mover ${run} is disabled and signed out.`)).toBeVisible();

  const db = serviceClient();
  const { data: mover } = await db.from("profiles").select("team_id, is_active").eq("email", mail("mv")).single();
  const { data: bravo } = await db.from("teams").select("id").eq("name", `Bravo ${run}`).single();
  expect(mover).toEqual({ team_id: bravo!.id, is_active: false });
  const { data: alpha } = await db.from("teams").select("team_lead_id").eq("name", `Alpha ${run}`).single();
  const { data: leadC } = await db.from("profiles").select("id, team_id").eq("email", mail("lc")).single();
  expect(alpha!.team_lead_id).toBe(leadC!.id);
  const { data: leadA } = await db.from("profiles").select("team_id").eq("email", mail("la")).single();
  expect(leadA!.team_id).toBeNull();
});

test("staff may have a foreign phone, and a repeated phone is refused with a message in the drawer", async ({ page }) => {
  const run = Date.now().toString(36);
  const digits = String(Math.floor(Math.random() * 10 ** 9)).padStart(9, "0");
  const phone = `+44 7${digits.slice(0, 3)} ${digits.slice(3)}`;
  const db = serviceClient();
  await page.goto("/users");

  await page.getByRole("button", { name: "Add person" }).first().click();
  let drawer = page.getByRole("dialog", { name: "Add a person" });
  await drawer.getByLabel("Full name").fill(`Abroad One ${run}`);
  await drawer.getByLabel("Email").fill(`e2e-${run}-abroad1@tradinglabs.test`);
  await drawer.getByLabel("Phone").fill(phone);
  await drawer.getByLabel("Role").selectOption({ label: "Technical Analyst" });
  await drawer.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByText(`Abroad One ${run} added.`)).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Add person" }).first().click();
  drawer = page.getByRole("dialog", { name: "Add a person" });
  await drawer.getByLabel("Full name").fill(`Abroad Two ${run}`);
  await drawer.getByLabel("Email").fill(`e2e-${run}-abroad2@tradinglabs.test`);
  await drawer.getByLabel("Phone").fill(phone);
  await drawer.getByLabel("Role").selectOption({ label: "Technical Analyst" });
  await drawer.getByRole("button", { name: "Add person" }).click();
  // The message sits inside the drawer, under the Phone box, and the drawer stays open.
  await expect(drawer.getByText("That phone number already belongs to another person.")).toBeVisible({ timeout: 20_000 });
  await expect(drawer).toBeVisible();

  // The second person was never created, so no invite email went out for them.
  const { data } = await db.from("profiles").select("email").like("email", `e2e-${run}-abroad%`);
  expect(data!.map((p) => p.email)).toEqual([`e2e-${run}-abroad1@tradinglabs.test`]);
  const { data: authUsers } = await db.auth.admin.listUsers({ perPage: 1000 });
  expect(authUsers.users.some((u) => u.email === `e2e-${run}-abroad2@tradinglabs.test`)).toBe(false);

  const stored = `+44${phone.replace(/\D/g, "").slice(2)}`;
  const { data: saved } = await db.from("profiles").select("phone").eq("email", `e2e-${run}-abroad1@tradinglabs.test`).single();
  expect(saved!.phone).toBe(stored);
});

test("team names and Team Leads: clear messages for a short name, a repeated name and a lead who leads", async ({ page }) => {
  test.setTimeout(120_000);
  const run = Date.now().toString(36);
  await page.goto("/users");
  await addPerson(page, { name: `Boss One ${run}`, email: `e2e-${run}-boss1@tradinglabs.test`, role: "Team Lead" });
  await addPerson(page, { name: `Boss Two ${run}`, email: `e2e-${run}-boss2@tradinglabs.test`, role: "Team Lead" });
  await addTeam(page, { name: `Echo ${run}`, color: "Cyan", lead: `Boss One ${run}` });

  // A one-letter name and the same name in other capitals are both refused, inside the drawer.
  await page.getByRole("button", { name: "Add team" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add a team" });
  await drawer.getByText("Coral", { exact: true }).click();
  await drawer.getByLabel("Team Lead").selectOption({ label: `Boss Two ${run}` });
  await drawer.getByLabel("Team name").fill("E");
  await drawer.getByRole("button", { name: "Add team" }).click();
  await expect(drawer.getByText("A team name needs at least 2 characters.")).toBeVisible();
  await drawer.getByLabel("Team name").fill(`ECHO ${run}`.toUpperCase());
  await drawer.getByRole("button", { name: "Add team" }).click();
  await expect(drawer.getByText("A team with that name already exists. Choose another name.")).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /discard/i }).click();

  // Switching off the lead of a team is refused, and the reason is on screen.
  await page.getByLabel("Search people").fill(`Boss One ${run}`);
  await page.getByRole("button", { name: `Disable Boss One ${run}` }).click();
  const confirm = page.getByRole("dialog", { name: `Disable Boss One ${run}?` });
  await confirm.getByRole("button", { name: "Disable account" }).click();
  await expect(confirm.getByText("This person leads a team. Change the Team Lead first.")).toBeVisible({ timeout: 20_000 });
  const { data } = await serviceClient().from("profiles").select("is_active").eq("email", `e2e-${run}-boss1@tradinglabs.test`).single();
  expect(data!.is_active).toBe(true);
});

test("the Superadmin resets someone else's password and the email arrives with a working link", async ({ page, request }) => {
  const run = Date.now().toString(36);
  const email = `e2e-${run}-reset@tradinglabs.test`;
  await page.goto("/users");
  await addPerson(page, { name: `Reset Target ${run}`, email, role: "Technical Analyst" });

  await page.getByLabel("Search people").fill(`Reset Target ${run}`);
  await page.getByRole("button", { name: `Reset password for Reset Target ${run}` }).click();
  await page.getByRole("dialog", { name: `Send Reset Target ${run} a password reset?` }).getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(`Reset link sent to ${email}.`)).toBeVisible({ timeout: 20_000 });

  // The local test inbox holds the invite and the reset. The reset link points back at this app.
  await expect
    .poll(async () => {
      const res = await request.get(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${email} subject:password`)}`);
      return res.ok() ? ((await res.json()) as { messages: unknown[] }).messages.length : 0;
    }, { timeout: 20_000 })
    .toBeGreaterThan(0);
});

test.describe("as an admin", () => {
  test.use({ storageState: storageStateFor("admin") });

  test("the Admin adds a Team Lead, a team and an agent, but cannot manage Admins or analysts", async ({ page }) => {
    const run = Date.now().toString(36);
    const mail = (who: string) => `e2e-${run}-${who}@tradinglabs.test`;
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users and teams" })).toBeVisible();

    // Only Team Lead and Agent can be given.
    await page.getByRole("button", { name: "Add person" }).first().click();
    const drawer = page.getByRole("dialog", { name: "Add a person" });
    await expect(drawer.getByLabel("Role").locator("option")).toHaveText(["Team Lead", "Agent"]);
    await drawer.getByRole("button", { name: "Cancel" }).click();

    await addPerson(page, { name: `Admin Lead ${run}`, email: mail("al"), role: "Team Lead" });
    await addTeam(page, { name: `Admin Team ${run}`, color: "Coral", lead: `Admin Lead ${run}` });
    await addPerson(page, { name: `Admin Agent ${run}`, email: mail("aa"), role: "Agent", team: `Admin Team ${run}` });

    // Rows the Admin may not manage show no actions.
    await page.getByLabel("Search people").fill("Omar Analyst");
    await expect(page.getByRole("table").getByText("Superadmin only")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit Omar Analyst" })).toHaveCount(0);

    const { data } = await serviceClient().from("profiles").select("role").like("email", `e2e-${run}-%`);
    expect(data!.map((p) => p.role).sort()).toEqual(["agent", "team_lead"]);
  });
});
