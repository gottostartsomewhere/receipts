// Checks whether Gemini Nano works in the filming browser (a Chrome profile holding a copy of
// the on-device model, promo/.chrome-nano). Usage: node promo/nano-check.mjs [headed]
import { chromium } from "file:///C:/Users/johnk/Desktop/Projects/recon-promo/node_modules/playwright/index.mjs";

const here = new URL(".", import.meta.url);
const dir = new URL(".chrome-nano/", here).pathname.replace(/^\/(\w:)/, "$1");
const headed = process.argv.includes("headed");
const ctx = await chromium.launchPersistentContext(dir, {
  channel: "chrome",
  headless: !headed,
  viewport: { width: 688, height: 728 },
  // Playwright's own switches (automation, disabled features, no field trials) switch Nano off;
  // launch Chrome close to how it runs normally.
  ignoreDefaultArgs: true,
  args: [`--user-data-dir=${dir}`, ...(headed ? [] : ["--headless=new"]), "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto("chrome://version");
console.log((await page.locator("#command_line").textContent()).slice(0, 400));
await page.goto("http://localhost:4173/app.html");
for (let i = 0; i < 12; i++) {
  const r = await page.evaluate(async () => {
    if (!("LanguageModel" in self)) return "no LanguageModel";
    try {
      return await LanguageModel.availability({ expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] });
    } catch (e) {
      return "error " + e.message;
    }
  });
  console.log(i, r);
  if (r === "available") {
    const t0 = Date.now();
    const out = await page.evaluate(async () => {
      const s = await LanguageModel.create({ expectedOutputs: [{ type: "text", languages: ["en"] }] });
      return s.prompt("Reply with one word: the colour of the sky on a clear day.");
    });
    console.log("prompt ->", JSON.stringify(out), `${Date.now() - t0} ms`);
    break;
  }
  await page.waitForTimeout(5000);
}
await ctx.close();
