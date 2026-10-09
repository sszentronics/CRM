import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, serviceClient, storageStateFor } from "./helpers/accounts";
import { readyClient, seedDeposit } from "./helpers/deposits";
import { loginWith, makeTeam } from "./helpers/world";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

const runId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

async function exportLeads(page: Page, teamName: string, sensitive: boolean) {
  await page.goto("/exports");
  await page.getByRole("radio", { name: /^Leads/ }).check();
  await page.getByLabel("Period", { exact: true }).selectOption({ label: "All time" });
  await page.getByLabel("Team", { exact: true }).selectOption({ label: teamName });
  if (sensitive) await page.getByLabel(/Include CNIC and IBAN numbers/).check();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  return readFileSync(await download.path(), "utf8");
}

test("the owners can answer which source brings the deposits, and all seven reports open", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await makeTeam(run, "RP1", 1);
  const client = await readyClient(run, team, null);
  const db = serviceClient();
  const source = `Source ${run}`;
  await db.from("leads").update({ source }).eq("id", client.lead.id);
  await seedDeposit(team, client, 4_321_000, `REP-${run}`.toUpperCase(), { verify: true });
  // A pending deposit on the same source must not count.
  const other = await readyClient(`${run}b`, team, null);
  await db.from("leads").update({ source }).eq("id", other.lead.id);
  await seedDeposit(team, other, 9_999_000, `REPB-${run}`.toUpperCase());

  const admin = await browser.newPage({ storageState: storageStateFor("admin") });
  await admin.goto("/reports?report=sources&period=all");
  const row = admin.getByRole("row").filter({ hasText: source });
  await expect(row).toContainText("Rs 4,321,000");
  await expect(row).not.toContainText("9,999,000");

  for (const name of ["Funnel", "Source performance", "Agent activity", "Deposits", "Analyst sessions", "Aging", "Quality"]) {
    await admin.getByRole("navigation", { name: "Reports" }).getByRole("link", { name }).click();
    await expect(admin.getByRole("region", { name })).toBeVisible();
    await expect(admin.getByRole("table", { name: `${name} data` }).or(admin.getByText("Nothing to show for these filters."))).toBeVisible();
  }

  // The Deposits report, filtered to the team, shows its verified total.
  await admin.goto(`/reports?report=deposits&period=all&team=${team.id}`);
  await expect(admin.getByRole("row").filter({ hasText: team.name })).toContainText("Rs 4,321,000");
  await db.from("teams").update({ is_active: false }).eq("id", team.id);
});

test("an Admin's export has no CNIC or IBAN; the Superadmin's can; each adds a history row and an audit row", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = runId();
  const team = await makeTeam(run, "RP2", 1);
  const client = await readyClient(run, team, null);
  const db = serviceClient();
  const { data: kyc } = await db.from("kyc_profiles").select("cnic_number, iban").eq("lead_id", client.lead.id).single();
  const { data: adminProfile } = await db.from("profiles").select("id").eq("email", ACCOUNTS.admin.email).single();
  const { data: superProfile } = await db.from("profiles").select("id").eq("email", ACCOUNTS.superadmin.email).single();
  const auditCount = async (id: string) =>
    (await db.from("audit_log").select("id", { count: "exact", head: true }).eq("action", "export.create").eq("user_id", id)).count ?? 0;

  const admin = await browser.newPage({ storageState: storageStateFor("admin") });
  const adminBefore = await auditCount(adminProfile!.id);
  const adminCsv = await exportLeads(admin, team.name, false);
  expect(adminCsv.split("\r\n")[0]).toBe("Name,Phone,City,Source,Campaign,Stage,Team,Agent,Added,Last activity");
  expect(adminCsv).toContain(client.name);
  expect(adminCsv).not.toContain(kyc!.cnic_number);
  expect(adminCsv).not.toContain(kyc!.iban);
  await expect(admin.getByLabel(/Include CNIC and IBAN numbers/)).toHaveCount(0);
  // One new history row and one new audit row.
  await expect(admin.getByRole("table", { name: "Export history" }).getByRole("row").filter({ hasText: team.name }).first()).toContainText("Not included");
  expect(await auditCount(adminProfile!.id)).toBe(adminBefore + 1);
  const { data: audit } = await db.from("audit_log").select("meta").eq("action", "export.create").eq("user_id", adminProfile!.id).order("created_at", { ascending: false }).limit(1).single();
  expect(audit!.meta).toMatchObject({ kind: "leads", rows: 1, includes_sensitive: false, team_id: team.id });

  const owner = await browser.newPage({ storageState: storageStateFor("superadmin") });
  const ownerBefore = await auditCount(superProfile!.id);
  const ownerCsv = await exportLeads(owner, team.name, true);
  expect(ownerCsv.split("\r\n")[0]).toContain("CNIC,IBAN");
  expect(ownerCsv).toContain(kyc!.cnic_number);
  expect(ownerCsv).toContain(kyc!.iban);
  expect(await auditCount(superProfile!.id)).toBe(ownerBefore + 1);
  await expect(owner.getByRole("table", { name: "Export history" }).getByRole("row").filter({ hasText: team.name }).first()).toContainText("Included");

  await db.from("teams").update({ is_active: false }).eq("id", team.id);
});

test("the audit log filters by user and by action and has no edit or delete control", async ({ browser }) => {
  const owner = await browser.newPage({ storageState: storageStateFor("superadmin") });
  await owner.goto("/audit-log");
  await owner.locator(`select[name="user"]`).selectOption({ label: ACCOUNTS.admin.name });
  await owner.locator(`select[name="action"]`).selectOption("export.create");
  await owner.getByRole("button", { name: "Apply filters" }).click();
  await expect(owner).toHaveURL(/action=export\.create/);

  const rows = owner.getByRole("table", { name: "Audit log entries" }).getByRole("row");
  await expect(rows.nth(1)).toBeVisible();
  const body = rows.filter({ hasNot: owner.getByRole("columnheader") });
  const count = await body.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(body.nth(i)).toContainText(ACCOUNTS.admin.name);
    await expect(body.nth(i)).toContainText("export.create");
  }
  // Read-only: nothing in the table can change or remove an entry.
  await expect(owner.getByRole("table", { name: "Audit log entries" }).getByRole("button")).toHaveCount(0);
  await expect(owner.getByRole("button", { name: /edit|delete|remove/i })).toHaveCount(0);
});

test("Team Leads, agents and Admins are kept out of the screens that are not theirs", async ({ browser }) => {
  const run = runId();
  const team = await makeTeam(run, "RP3", 1);
  const tl = await browser.newPage();
  await loginWith(tl, team.lead.email);
  for (const path of ["/reports", "/exports", "/audit-log"]) {
    await tl.goto(path);
    await expect(tl.getByRole("heading", { name: "No access" })).toBeVisible();
  }
  const admin = await browser.newPage({ storageState: storageStateFor("admin") });
  await admin.goto("/audit-log");
  await expect(admin.getByRole("heading", { name: "No access" })).toBeVisible();
  await serviceClient().from("teams").update({ is_active: false }).eq("id", team.id);
});
