// Renders marketing/slides.html into the store images.
// Usage: node marketing/render.mjs   ->  marketing/store-1..5.png (1280x800), tile-440x280.png,
// and @2x copies for Devpost.
import { chromium } from "file:///C:/Users/johnk/Desktop/Projects/recon-promo/node_modules/playwright/index.mjs";

const here = new URL(".", import.meta.url);
const file = (name) => new URL(name, here).pathname.replace(/^\/(\w:)/, "$1");
const browser = await chromium.launch({ channel: "chrome", args: ["--hide-scrollbars", "--force-color-profile=srgb", "--allow-file-access-from-files"] });

async function render(query, w, h, scale, out) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.goto(new URL(`slides.html${query}`, here).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: file(out) });
  await page.close();
}

for (let n = 1; n <= 5; n++) {
  await render(`?n=${n}`, 1280, 800, 1, `store-${n}.png`);
  await render(`?n=${n}`, 1280, 800, 2, `store-${n}@2x.png`);
}
await render("?tile", 440, 280, 1, "tile-440x280.png");
await render("?tile", 440, 280, 2, "tile-440x280@2x.png");
await browser.close();
console.log("rendered");
