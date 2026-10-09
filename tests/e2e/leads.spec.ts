import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { parseCsv, toCsv } from "../../lib/leads/import";
import { ACCOUNTS, serviceClient, storageStateFor } from "./helpers/accounts";
import { expectBrandPage } from "./helpers/brand";

/**
 * Mobile numbers no lead uses yet: random 0345 numbers, checked against the database
 * so parallel tests and earlier runs never collide.
 */
async function freshPhones(count: number): Promise<string[]> {
  const out = new Set<string>();
  while (out.size < count) {
    const batch = new Set<string>();
    while (batch.size < count - out.size) {
      const local = `0345${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
      if (!out.has(local)) batch.add(local);
    }
    const { data } = await serviceClient().rpc("existing_lead_phones", { phones: [...batch].map(toStored) });
    const taken = new Set((data ?? []) as string[]);
    for (const p of batch) if (!taken.has(toStored(p))) out.add(p);
  }
  return [...out];
}

function toStored(local: string) {
  return `+92${local.replace(/\s/g, "").slice(1)}`;
}

async function seedLead(phone: string, name = "Seeded Lead") {
  const db = serviceClient();
  const { data: creator } = await db.from("profiles").select("id").eq("email", ACCOUNTS.superadmin.email).single();
  const { data, error } = await db
    .from("leads")
    .insert({ full_name: name, phone: toStored(phone), source: "Facebook", created_by: creator!.id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function uploadCsv(page: Page, name: string, rows: string[][]) {
  await page.getByRole("tab", { name: "Import a file" }).click();
  await page.getByLabel("Choose a lead file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(toCsv(rows)),
  });
  await expect(page.getByRole("heading", { name: "Match the columns" })).toBeVisible();
}

test.describe("as the Superadmin", () => {
  test.use({ storageState: storageStateFor("superadmin") });

  test("importing 10 rows adds exactly 7 and offers the 3 skipped rows as a download", async ({ page }) => {
    const [existing, ...good] = await freshPhones(8);
    await seedLead(existing, "Already Here");
    const rows = [
      ["Full name", "Phone", "Source", "City"],
      ...good.map((p, i) => [`Import Lead ${i + 1}`, p, i % 2 ? "Instagram" : "facebook", "Lahore"]),
      ["Repeat Row", good[0], "Facebook", "Lahore"],
      ["Old Lead", existing, "PR", "Karachi"],
      ["Bad Number", "12345", "Facebook", "Lahore"],
    ];

    await page.goto("/leads/add");
    await expectBrandPage(page);
    await uploadCsv(page, "ten-rows.csv", rows);
    await page.getByRole("button", { name: "Check the rows" }).click();

    await expect(page.getByText("New leads to add", { exact: true }).locator("..")).toContainText("7");
    await expect(page.getByText("Duplicates to skip", { exact: true }).locator("..")).toContainText("2");
    await expect(page.getByText("Rows with problems", { exact: true }).locator("..")).toContainText("1");

    await page.getByRole("button", { name: "Import 7 leads" }).click();
    await expect(page.getByText("7 leads added to the pool.").first()).toBeVisible();

    const { data: saved } = await serviceClient().from("leads").select("phone, stage, team_id").in("phone", good.map(toStored));
    expect(saved).toHaveLength(7);
    expect(saved!.every((l) => l.stage === "new" && l.team_id === null)).toBe(true);

    const [file] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download 3 skipped rows" }).click(),
    ]);
    const csv = parseCsv(readFileSync(await file.path(), "utf8"));
    expect(csv[0]).toEqual(["Row", "Full name", "Phone", "Source", "City", "Reason"]);
    expect(csv.slice(1).map((r) => r[1])).toEqual(["Repeat Row", "Old Lead", "Bad Number"]);
    expect(csv[1][5]).toBe("That number appears earlier in this file.");
    expect(csv[2][5]).toBe("That number is already in the system.");
  });

  test("adding a lead with an existing phone shows the duplicate message and adds nothing", async ({ page }) => {
    const [phone] = await freshPhones(1);
    const existingId = await seedLead(phone, "First Owner");
    await page.goto("/leads/add");
    await page.getByLabel("Full name").fill("Second Try");
    await page.getByLabel("Phone", { exact: true }).fill(phone);
    await page.getByLabel("Source").selectOption("PR");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText("That number is already in the system.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the existing lead" })).toHaveAttribute("href", `/lead/${existingId}`);
    const { data } = await serviceClient().from("leads").select("full_name").eq("phone", toStored(phone));
    expect(data).toEqual([{ full_name: "First Owner" }]);
  });

  test("Done when: one lead by form, then 200 by file", async ({ page }) => {
    test.setTimeout(120_000);
    const [single, another, ...many] = await freshPhones(202);

    // One by form: Save opens the new lead.
    await page.goto("/leads/add");
    await page.getByLabel("Full name").fill("Form Lead");
    await page.getByLabel("Phone", { exact: true }).fill(single);
    await page.getByLabel("Source").selectOption("Referral");
    await page.getByLabel("City").fill("Islamabad");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/lead\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Form Lead" })).toBeVisible();
    await expect(page.getByText("New", { exact: true })).toBeVisible();

    // "Save and add another" keeps you on the form.
    await page.goto("/leads/add");
    await page.getByLabel("Full name").fill("Another Lead");
    await page.getByLabel("Phone", { exact: true }).fill(another);
    await page.getByLabel("Source").selectOption("PR");
    await page.getByRole("button", { name: "Save and add another" }).click();
    await expect(page.getByText("Another Lead saved. Add the next one.")).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("");

    // 200 by file, with one source for every row.
    await page.goto("/leads/add");
    await uploadCsv(page, "two-hundred.csv", [["Name", "Mobile"], ...many.map((p, i) => [`Bulk Lead ${i + 1}`, p])]);
    await page.getByLabel("Source", { exact: true }).selectOption("Same source for every row");
    await page.getByLabel("Source for every row").selectOption("TikTok");
    await page.getByRole("button", { name: "Check the rows" }).click();
    await page.getByRole("button", { name: "Import 200 leads" }).click();
    await expect(page.getByText("200 leads added to the pool.").first()).toBeVisible();

    const { count } = await serviceClient()
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("phone", many.map(toStored))
      .eq("source", "TikTok");
    expect(count).toBe(200);
  });
});

test.describe("as an Admin", () => {
  test.use({ storageState: storageStateFor("admin") });

  test("search for a seeded phone returns the lead", async ({ page }) => {
    const [phone] = await freshPhones(1);
    await seedLead(phone, "Searchable Sana");
    await page.goto("/work-queue");
    const box = page.getByRole("combobox", { name: "Search leads by name, phone or CNIC" });
    await box.fill(phone);
    await expect(page.getByRole("option", { name: /Searchable Sana/ })).toBeVisible();

    await box.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByRole("link", { name: /Searchable Sana/ })).toBeVisible();
  });
});

test.describe("as an agent", () => {
  test.use({ storageState: storageStateFor("agent") });

  test("a phone outside the agent's leads shows only 'Already in the system'", async ({ page }) => {
    const [phone] = await freshPhones(1);
    await seedLead(phone, "Hidden Hamza");
    await page.goto("/today");
    await page.getByRole("combobox", { name: "Search leads by name, phone or CNIC" }).fill(phone);
    await expect(page.getByText("Already in the system.")).toBeVisible();
    await expect(page.getByText("Hidden Hamza")).toHaveCount(0);
  });

  test("the add-leads screen is closed", async ({ page }) => {
    await page.goto("/leads/add");
    await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
  });
});
