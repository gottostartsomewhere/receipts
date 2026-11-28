// Renders the YouTube thumbnails: marketing/thumb-demo.png and thumb-promo.png (1280x720).
import { chromium } from "file:///C:/Users/johnk/Desktop/Projects/recon-promo/node_modules/playwright/index.mjs";

const here = new URL(".", import.meta.url);
const file = (name) => new URL(name, here).pathname.replace(/^\/(\w:)/, "$1");
const browser = await chromium.launch({ channel: "chrome", args: ["--hide-scrollbars", "--force-color-profile=srgb", "--allow-file-access-from-files"] });
for (const v of ["demo", "promo"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(new URL(`thumbs.html?v=${v}`, here).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: file(`thumb-${v}.png`) });
  await page.close();
}
await browser.close();
console.log("thumbnails rendered");
