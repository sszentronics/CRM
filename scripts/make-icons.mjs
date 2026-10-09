// Makes the app icons: the white logo on brand purple. Run once with `pnpm icons`; the PNGs are committed.
// The logo is white, so it only ever sits on the brand purple, as the design rules require.
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const PURPLE = "#220B47";
const logo = `data:image/png;base64,${readFileSync("public/brand/tl-logo.png").toString("base64")}`;
const out = "public/icons";
mkdirSync(out, { recursive: true });

// size: image size; scale: logo width as a share of the icon. Maskable icons keep the logo inside the safe zone.
const icons = [
  { file: "icon-192.png", size: 192, scale: 0.56 },
  { file: "icon-512.png", size: 512, scale: 0.56 },
  { file: "icon-maskable-512.png", size: 512, scale: 0.4 },
  { file: "apple-touch-icon.png", size: 180, scale: 0.56 },
];

const browser = await chromium.launch();
for (const { file, size, scale } of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px;background:${PURPLE};display:flex;align-items:center;justify-content:center">
       <img src="${logo}" style="width:${Math.round(size * scale)}px;height:auto" />
     </body>`,
  );
  await page.screenshot({ path: `${out}/${file}` });
  await page.close();
  console.log(`${out}/${file}`);
}
await browser.close();
