import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ROUTE_ACCESS } from "../../lib/auth/access";
import { ROLES, type Role } from "../../lib/auth/roles";
import { loadEnv, storageStateFor, type AccountKey } from "./helpers/accounts";
import { BRAND_RAIL, expectBrandPage } from "./helpers/brand";

test.use({ viewport: { width: 1440, height: 900 } });

const ACCOUNT_FOR: Record<Role, AccountKey> = {
  superadmin: "superadmin",
  admin: "admin",
  team_lead: "team_lead",
  agent: "agent",
  analyst: "analyst",
};

/**
 * Every screen with a fixed address. "/lead" is one lead, checked in its own tests, and the
 * styleguide is a developer page, so both are left out of the list of working screens below.
 */
const ROUTES = Object.keys(ROUTE_ACCESS).filter((p) => p !== "/lead");

async function isNoAccess(page: Page) {
  return (await page.getByRole("heading", { name: "No access" }).count()) > 0;
}

test.describe("role matrix: every role against every route", () => {
  for (const role of ROLES) {
    test(`${role} gets the access BUILD.md section 3 gives it`, async ({ browser }) => {
      test.setTimeout(180_000);
      const page = await browser.newPage({ storageState: storageStateFor(ACCOUNT_FOR[role]) });
      const wrong: string[] = [];
      for (const route of ROUTES) {
        const response = await page.goto(route);
        // Screens stream in behind a loading shell, so wait for the heading before judging the result.
        await page.locator("h1").first().waitFor();
        const allowed = ROUTE_ACCESS[route].includes(role);
        if (response && response.status() >= 500) wrong.push(`${route}: server error ${response.status()}`);
        else if (allowed && (await isNoAccess(page))) wrong.push(`${route}: should open for ${role}`);
        else if (!allowed && !(await isNoAccess(page))) wrong.push(`${route}: should be closed to ${role}`);
        if (allowed) {
          // An open screen shows no placeholder and no error page.
          await expect(page.getByText("This screen is on its way.")).toHaveCount(0);
          await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
        }
      }
      expect(wrong, wrong.join("\n")).toEqual([]);
      await page.close();
    });
  }
});

test("every screen passes the QuantraPro check, and the Arena its dark green check", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await browser.newPage({ storageState: storageStateFor("superadmin") });
  for (const route of ROUTES.filter((r) => r !== "/arena")) {
    await page.goto(route);
    await expect(page.locator("main").first(), route).toBeVisible();
    await expectBrandPage(page);
  }
  // The error-free pages that sit outside the app shell.
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expectBrandPage(page);

  await page.goto("/arena");
  await expect(page.getByRole("heading", { name: "The Arena" })).toBeVisible();
  const image = await page.evaluate(() => getComputedStyle(document.querySelector(".tl-arena")!).backgroundImage);
  expect(image).toContain("rgb(14, 42, 28)");
  expect(image).toContain("rgb(6, 20, 12)");
  await page.close();
});

test("the sign-in and offline screens are QuantraPro, and open without signing in", async ({ browser }) => {
  const page = await browser.newPage();
  for (const route of ["/login", "/forgot-password", "/offline"]) {
    await page.goto(route);
    await expect(page.locator("main, body").first()).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), route).toBe("rgb(250, 250, 250)");
  }
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
  // The white logo sits on the brand panel.
  const panel = await page.locator("img[alt='QuantraPro']").evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor);
  expect(panel).toBe(BRAND_RAIL);
  await page.close();
});

test("the app is installable: manifest, icons and an offline-ready service worker", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.theme_color).toBe("#08150F");
  expect(manifest.background_color).toBe("#08150F");
  expect(manifest.display).toBe("standalone");
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  expect((await request.get("/sw.js")).status()).toBe(200);
});

test("the offline page is shown when the network drops", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  await page.goto("/offline");
  await page.evaluate(() => navigator.serviceWorker.register("/sw.js"));
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Reload once so the worker controls the page, then go offline and open a screen.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto("/login").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
  await context.close();
});

test("no service-role key or server-only variable name reaches any browser bundle", async () => {
  const { service } = loadEnv();
  const root = path.join(".next", "static");
  expect(existsSync(root), "run a production build first").toBe(true);
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|css|html|json|map|txt)$/.test(name)) {
        const text = readFileSync(full, "utf8");
        if (text.includes(service)) hits.push(`${full}: the service-role key`);
        if (text.includes("SUPABASE_SERVICE_ROLE_KEY")) hits.push(`${full}: the variable name`);
      }
    }
  };
  walk(root);
  expect(hits, hits.join("\n")).toEqual([]);
});
