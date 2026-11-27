// Renders the promo composition to frames, then (with --encode) to promo/out/receipts-promo.mp4.
//   node promo/render.mjs still 4.5 12 30      -> promo/stills/<t>.png, for checking frames
//   node promo/render.mjs frames [workers]     -> promo/frames/00001.jpg ... and promo/out/cues.json
// The composition is deterministic (window.renderFrame(t)), so workers can split the frames.
import { chromium } from "file:///C:/Users/johnk/Desktop/Projects/recon-promo/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const FPS = 30;
const here = new URL(".", import.meta.url);
const path = (rel) => new URL(rel, here).pathname.replace(/^\/(\w:)/, "$1");
const [mode = "still", ...args] = process.argv.slice(2);

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--allow-file-access-from-files", "--disable-gpu-vsync"],
});

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("console", (m) => m.type() === "warning" && console.log("page:", m.text()));
  page.on("pageerror", (e) => console.log("page error:", e.message));
  await page.goto(new URL("index.html", here).href);
  await page.evaluate(() => window.READY);
  return page;
}

if (mode === "still") {
  mkdirSync(path("stills/"), { recursive: true });
  const page = await openPage();
  for (const t of args.map(Number)) {
    await page.evaluate((t) => window.renderFrame(t), t);
    await page.screenshot({ path: path(`stills/${t.toFixed(2)}.png`) });
  }
  console.log("stills", args.join(" "));
} else if (mode === "frames") {
  mkdirSync(path("frames/"), { recursive: true });
  mkdirSync(path("out/"), { recursive: true });
  // frames [workers] [fromSeconds] [toSeconds]: re-render part of the film after a change.
  const workers = Number(args[0] || 4);
  const pages = await Promise.all(Array.from({ length: workers }, openPage));
  const { cues, dur } = await pages[0].evaluate(() => ({ cues: window.CUES, dur: window.DURATION }));
  writeFileSync(path("out/cues.json"), JSON.stringify({ fps: FPS, duration: dur, cues }, null, 1));
  const total = Math.round(Number(args[2] ?? dur) * FPS);
  let next = Math.round(Number(args[1] ?? 0) * FPS), done = 0;
  const started = Date.now();
  await Promise.all(
    pages.map(async (page) => {
      const cdp = await page.context().newCDPSession(page);
      while (next < total) {
        const i = next++;
        await page.evaluate((t) => window.renderFrame(t), i / FPS);
        const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 95 });
        writeFileSync(path(`frames/${String(i + 1).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
        if (++done % 150 === 0) console.log(`${done}/${total} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`);
      }
    }),
  );
  console.log(`rendered ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
await browser.close();
