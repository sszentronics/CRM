import { expect, type Page } from "@playwright/test";

/** --tl-bg, the light page background on every app route. */
export const PAGE_BG = "rgb(247, 245, 252)";
/** --tl-brand, the purple of the sidebar and every surface the white logo sits on. */
export const BRAND_PURPLE = "rgb(34, 11, 71)";

/**
 * Every e2e spec calls this (BUILD.md section 8). Asserts the white-and-purple
 * theme: the page is --tl-bg, no full-width container is dark, and the white
 * logo only ever sits on brand purple.
 */
export async function expectBrandPage(page: Page) {
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBg, "body background must be --tl-bg").toBe(PAGE_BG);

  const result = await page.evaluate(() => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:[,/]\s*([\d.]+))?/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    };
    const lum = (c: { r: number; g: number; b: number }) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;

    // No dark full-width containers in the content area.
    const main = document.querySelector("main") ?? document.body;
    const mainWidth = main.getBoundingClientRect().width;
    const dark: string[] = [];
    for (const el of Array.from(main.querySelectorAll<HTMLElement>("*"))) {
      if (el.closest("dialog")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < mainWidth * 0.9 || rect.height === 0) continue;
      const c = parse(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.3 && lum(c) < 0.3) dark.push(`${el.tagName.toLowerCase()}.${el.className}`);
    }

    // The white logo must sit on brand purple: walk up to the first painted background.
    const logoBgs: string[] = [];
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img[alt="Trading Labs"]'))) {
      if (img.getBoundingClientRect().width === 0) continue;
      let el: HTMLElement | null = img;
      while (el) {
        const c = parse(getComputedStyle(el).backgroundColor);
        if (c && c.a > 0.9) {
          logoBgs.push(`rgb(${c.r}, ${c.g}, ${c.b})`);
          break;
        }
        el = el.parentElement;
      }
    }
    return { dark, logoBgs };
  });

  expect(result.dark, "no full-width container in the content may be dark").toEqual([]);
  for (const bg of result.logoBgs) expect(bg, "the white logo sits on brand purple").toBe("rgb(34, 11, 71)");
}

/** True when the page scrolls sideways. */
export async function hasHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}
