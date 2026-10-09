import { expect, test } from "@playwright/test";
import { addMonths, karachiMonthStart } from "../../lib/format/months";
import { serviceClient, storageStateFor } from "./helpers/accounts";
import { expectBrandPage } from "./helpers/brand";

test.use({ storageState: storageStateFor("superadmin") });

test("the Superadmin adds a PSX and a PMEX broker and edits one checklist", async ({ page }) => {
  const run = Date.now().toString(36);
  const psx = `Topline Securities ${run}`;
  const pmex = `Commodity House ${run}`;

  await page.goto("/brokers");
  await expectBrandPage(page);

  for (const [name, market] of [
    [psx, "PSX"],
    [pmex, "PMEX"],
  ] as const) {
    await page.getByRole("button", { name: "Add broker" }).first().click();
    const drawer = page.getByRole("dialog", { name: "Add a broker" });
    await drawer.getByLabel("Broker name").fill(name);
    await drawer.getByText(market, { exact: true }).click();
    await drawer.getByRole("button", { name: "Add broker" }).click();
    await expect(page.getByText(`${name} added.`)).toBeVisible();
    await expect(drawer).toBeHidden();
  }

  // Untick one checklist item on the PMEX broker.
  await page.getByRole("button", { name: `Edit ${pmex}` }).click();
  const edit = page.getByRole("dialog", { name: `Edit ${pmex}` });
  await edit.getByLabel("Signature specimen").uncheck();
  await edit.getByRole("button", { name: "Save broker" }).click();
  await expect(page.getByText(`${pmex} saved. Checklist changes apply to new clients only.`)).toBeVisible();

  // Switch the PSX broker off: it stays in the list, marked Off.
  await page.getByRole("switch", { name: `${psx} is on` }).click();
  await expect(page.getByText(`${psx} is off. Existing clients keep it.`)).toBeVisible();

  const db = serviceClient();
  const { data: rows } = await db.from("brokers").select("name, market, kyc_checklist, is_active").in("name", [psx, pmex]);
  const byName = new Map(rows!.map((r) => [r.name, r]));
  expect(byName.get(pmex)).toMatchObject({ market: "pmex", is_active: true });
  expect(byName.get(pmex)!.kyc_checklist).not.toContain("signature");
  expect(byName.get(pmex)!.kyc_checklist).toContain("cnic_front");
  expect(byName.get(psx)).toMatchObject({ market: "psx", is_active: false });
  expect(byName.get(psx)!.kyc_checklist).toContain("signature");
});

test("changing a setting writes an audit row with the old and new value", async ({ page }) => {
  const db = serviceClient();
  const { data: row } = await db.from("settings").select("value").eq("key", "stale_days").single();
  const before = Number(row!.value);
  const after = before >= 90 ? before - 1 : before + 1;
  try {
    await page.goto("/settings");
    await expectBrandPage(page);
    await page.getByRole("button", { name: "Edit Stale after" }).click();
    await page.getByRole("textbox", { name: "Stale after" }).fill(String(after));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Stale after saved.")).toBeVisible();

    const { data: audit } = await db
      .from("audit_log")
      .select("meta, user_id")
      .eq("action", "setting.update")
      .eq("entity_id", "stale_days")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(audit!.meta).toEqual({ old: before, new: after });
    expect(audit!.user_id).not.toBeNull();
  } finally {
    // Leave the setting as this test found it, even if it failed halfway.
    await db.from("settings").update({ value: before }).eq("key", "stale_days");
  }
});

test("a list setting can gain and lose items", async ({ page }) => {
  const db = serviceClient();
  const { data: original } = await db.from("settings").select("value").eq("key", "lead_sources").single();
  const item = `Source ${Date.now().toString(36)}`;
  try {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Edit Lead sources" }).click();
    await page.getByRole("textbox", { name: "New item" }).fill(item);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Lead sources saved.")).toBeVisible();
    let { data } = await db.from("settings").select("value").eq("key", "lead_sources").single();
    expect(data!.value).toContain(item);

    await expect(page.getByText("Lead sources saved.")).toBeHidden({ timeout: 6000 });
    await page.getByRole("button", { name: "Edit Lead sources" }).click();
    await page.getByRole("button", { name: `Remove ${item}` }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Lead sources saved.")).toBeVisible();
    ({ data } = await db.from("settings").select("value").eq("key", "lead_sources").single());
    expect(data!.value).not.toContain(item);
  } finally {
    // Leave the list as this test found it, even if it failed halfway.
    await db.from("settings").update({ value: original!.value }).eq("key", "lead_sources");
  }
});

test("the Superadmin sets this month's targets for every team and copies them forward", async ({ page }) => {
  // The local test database collects many teams over runs; real use has a handful.
  test.setTimeout(90_000);
  const thisMonth = karachiMonthStart();
  const nextMonth = addMonths(thisMonth, 1);
  const lastMonth = addMonths(thisMonth, -1);

  await page.goto("/targets");
  await expectBrandPage(page);

  // Past months show no inputs.
  await expect(page.locator(`input[name$=":${lastMonth}"]`)).toHaveCount(0);

  const inputs = page.locator(`input[name^="t:"][name$=":${thisMonth}"]`);
  const count = await inputs.count();
  expect(count).toBeGreaterThan(0);
  const amount = 3_000_000 + (Date.now() % 1000) * 1000;
  // The teams on the grid now. Other specs add teams in parallel, and the grid refreshes after a save.
  const teamIds = (await inputs.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).name))).map(
    (n) => n.split(":")[1],
  );
  // Fill every input in one pass (the local test database holds hundreds of teams).
  // Uses the native value setter and an input event, exactly as typing does for React.
  await inputs.evaluateAll((els, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    for (const el of els as HTMLInputElement[]) {
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, String(amount));
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect(page.getByText(/targets? saved\.|No changes to save\./)).toBeVisible({ timeout: 20_000 });

  const db = serviceClient();
  // Check up to 50 of them: the local test database collects hundreds of teams over many runs.
  const sample = teamIds.slice(0, 50);
  const { data: saved, error: savedError } = await db
    .from("targets")
    .select("team_id, amount_pkr")
    .eq("month", thisMonth)
    .in("team_id", sample);
  expect(savedError).toBeNull();
  const savedFor = new Map(saved!.map((t) => [t.team_id, Number(t.amount_pkr)]));
  for (const id of sample) expect(savedFor.get(id), `team ${id}`).toBe(amount);

  // Copy last month into next month, then save. Wait for the first toast to go, since the second says the same.
  await expect(page.getByText(/targets? saved\./)).toBeHidden({ timeout: 6000 });
  await page.getByRole("button", { name: /^Copy .* into / }).nth(1).click();
  await expect(page.locator(`input[name="t:${teamIds[0]}:${nextMonth}"]`)).toHaveValue(amount.toLocaleString("en-US"));
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect(page.getByText(/targets? saved\./)).toBeVisible({ timeout: 20_000 });
  const { data: copied } = await db.from("targets").select("amount_pkr").eq("month", nextMonth).in("team_id", sample);
  expect(copied!.map((c) => Number(c.amount_pkr))).toEqual(sample.map(() => amount));
});

test.describe("as an admin", () => {
  test.use({ storageState: storageStateFor("admin") });

  test("brokers, targets and settings are closed", async ({ page }) => {
    for (const path of ["/brokers", "/targets", "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
    }
  });
});
