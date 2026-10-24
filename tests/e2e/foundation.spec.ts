import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { storageStateFor } from "./helpers/accounts";
import { BRAND_RAIL, expectBrandPage, hasHorizontalScroll } from "./helpers/brand";

// The styleguide is a Superadmin screen since Module 1.
test.use({ storageState: storageStateFor("superadmin") });

/** Laptop screens are the primary target. 1024 is the narrowest window that still gets the sidebar. */
const VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
  test.describe(`styleguide at ${vp.width} px`, () => {
    test.use({ viewport: vp });

    test("uses the QuantraPro theme with no horizontal scroll", async ({ page }) => {
      await page.goto("/styleguide");
      await expectBrandPage(page);
      expect(await hasHorizontalScroll(page)).toBe(false);
    });

    test("shows the logo on the brand sidebar with alt text", async ({ page }) => {
      await page.goto("/styleguide");
      const sidebar = page.locator("aside");
      await expect(sidebar).toBeVisible();
      expect(await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(BRAND_RAIL);
      const logo = sidebar.getByRole("img", { name: "Trading Labs" });
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute("alt", "Trading Labs");
      expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(sidebar.getByRole("link", { name: "Styleguide" })).toHaveAttribute("aria-current", "page");
    });

    test("has no serious or critical accessibility issues", async ({ page }) => {
      await page.goto("/styleguide");
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        bad.map((v) => `${v.id}: ${v.help} at ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
    });
  });
}

test("text tokens meet 4.5 to 1 contrast on every surface", async ({ page }) => {
  await page.goto("/styleguide");
  const ratios = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const hex = (name: string) => {
      const h = css.getPropertyValue(name).trim();
      // The minifier may shorten #ffffff to #fff.
      return h.length === 4 ? h.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : h;
    };
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = (h: string) => {
      const n = parseInt(h.slice(1), 16);
      return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const out: Record<string, number> = {};
    const text = ["--tl-text", "--tl-text-2", "--tl-muted", "--tl-link", "--tl-win", "--tl-danger", "--tl-wait"];
    const stages = ["idle", "call", "hot", "analyst", "docs", "recorded", "verified", "closed"].map((s) => `--tl-stage-${s}`);
    for (const fg of [...text, ...stages]) {
      for (const bg of ["--tl-bg", "--tl-surface", "--tl-raised"]) out[`${fg} on ${bg}`] = ratio(fg, bg);
    }
    for (const fg of ["--tl-brand-text", "--tl-brand-muted"]) {
      for (const bg of ["--tl-brand", "--tl-brand-raised"]) out[`${fg} on ${bg}`] = ratio(fg, bg);
    }
    out["white on --tl-primary"] = ratio("--tl-surface", "--tl-primary");
    return out;
  });
  for (const [pair, r] of Object.entries(ratios)) {
    expect(r, pair).toBeGreaterThanOrEqual(4.5);
  }
});

test("on a narrow window the menu opens from a button", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/styleguide");
  await expect(page.locator("aside")).toBeHidden();
  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expectBrandPage(page);
});

test("a drawer with unsaved input asks before closing", async ({ page }) => {
  await page.goto("/styleguide");
  await page.getByRole("button", { name: "Open drawer" }).click();
  const drawer = page.getByRole("dialog", { name: "Log a call" });
  await expect(drawer).toBeVisible();

  // Nothing typed: Escape closes at once.
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: "Open drawer" }).click();
  await drawer.getByLabel("Notes").fill("Called twice");
  await page.keyboard.press("Escape");
  await expect(drawer.getByText("You have unsaved changes. Discard them?")).toBeVisible();

  await drawer.getByRole("button", { name: "Keep editing" }).click();
  await expect(drawer.getByLabel("Notes")).toHaveValue("Called twice");

  await drawer.getByRole("button", { name: "Close" }).click();
  await drawer.getByRole("button", { name: "Discard changes" }).click();
  await expect(drawer).toBeHidden();
});

test("toasts never stack more than two", async ({ page }) => {
  await page.goto("/styleguide");
  const button = page.getByRole("button", { name: "Success toast" });
  await button.click();
  await button.click();
  await button.click();
  await expect(page.getByRole("status").filter({ hasText: "Call saved." })).toHaveCount(2);
});
