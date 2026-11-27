// Renders the promo composition to frames, then (with --encode) to promo/out/receipts-promo.mp4.
//   node promo/render.mjs still 4.5 12 30      -> promo/stills/<t>.png, for checking frames
//   node promo/render.mjs frames [workers]     -> promo/frames/00001.jpg ... and promo/out/cues.json
// The composition is deterministic (window.renderFrame(t)), so workers can split the frames.
import { chromium } from "file:///C:/Users/johnk/Desktop/Projects/recon-promo/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const FPS = 30;
const here = new URL(".", import.meta.url);
const path = (rel) => new URL(rel, here).pathname.replace(/^\/(\w:)/, "$1");
// --page cuts/demo.html --out demo  picks another composition; frames go to <out>-frames/.
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const PAGE = opt("page", "index.html");
const OUT = opt("out", "");
const FRAMES = OUT ? `${OUT}-frames/` : "frames/";
const STILLS = OUT ? `stills/${OUT}-` : "stills/";
const [mode = "still", ...args] = argv;

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--allow-file-access-from-files", "--disable-gpu-vsync"],
});

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("console", (m) => m.type() === "warning" && console.log("page:", m.text()));
  page.on("pageerror", (e) => console.log("page error:", e.message));
  await page.goto(new URL(PAGE, here).href);
  await page.waitForFunction(() => window.READY_DONE || (window.READY && window.renderFrame), null, { timeout: 120000 });
  await page.evaluate(() => window.READY);
  return page;
}

if (mode === "still") {
  mkdirSync(path("stills/"), { recursive: true });
  const page = await openPage();
  for (const t of args.map(Number)) {
    await page.evaluate((t) => window.renderFrame(t), t);
    await page.screenshot({ path: path(`${STILLS}${t.toFixed(2)}.png`) });
  }
  console.log("stills", args.join(" "));
} else if (mode === "check") {
  // Every 0.1 s: text that touches the window, other text, or the frame edge; callouts covered
  // by text or off frame. Callout and zoom positions go to out/<name>-align.json for
  // check_align.py, which compares the pixels under them with the frame they were measured on.
  const page = await openPage();
  const dur = await page.evaluate(() => window.DURATION);
  const step = Number(args[0] || 0.1);
  const issues = [], align = [];
  const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const off = (a) => a.x < -1 || a.y < -1 || a.x + a.w > 1921 || a.y + a.h > 1081;
  for (let t = 0; t < dur; t += step) {
    const s = await page.evaluate((t) => window.ENG_CHECK(t), t);
    const T = s.texts;
    for (const a of T) {
      if (s.window && inter(a, s.window) > 4) issues.push([t, `${a.kind} "${a.text}" over the window`]);
      if (off(a) && !a.bleed) issues.push([t, `${a.kind} "${a.text}" off the frame`]);
    }
    for (let i = 0; i < T.length; i++)
      for (let j = i + 1; j < T.length; j++)
        if (inter(T[i], T[j]) > 30 && !(T[i].kind === "list" && T[j].kind === "card") && !(T[j].kind === "list" && T[i].kind === "card")) issues.push([t, `${T[i].kind} "${T[i].text}" overlaps ${T[j].kind} "${T[j].text}"`]);
    for (const c of s.callouts) {
      for (const a of T) if (inter(a, c.box) > 4 || (c.tag && inter(a, c.tag) > 4)) issues.push([t, `${a.kind} "${a.text}" covers callout "${c.label}"`]);
      if (off(c.box)) issues.push([t, `callout "${c.label}" runs off the frame`]);
      if (s.badge && c.tag && inter(s.badge, c.tag) > 4) issues.push([t, `speed badge covers callout "${c.label}"`]);
      if (c.tag && off(c.tag)) issues.push([t, `callout tag "${c.label}" runs off the frame`]);
      align.push({ t: Math.round(t * 100) / 100, kind: "callout", label: c.label, rect: c.rect, refFrame: c.refFrame, frame: s.frame });
    }
    if (s.focus) align.push({ t: Math.round(t * 100) / 100, kind: "zoom", label: s.focus.name || "region", rect: s.focus.rect, refFrame: s.focus.refFrame, frame: s.frame });
  }
  // fold repeats into time ranges
  const byMsg = new Map();
  for (const [t, m] of issues) {
    const r = byMsg.get(m) ?? [];
    const last = r[r.length - 1];
    if (last && t - last[1] <= step * 1.5) last[1] = t;
    else r.push([t, t]);
    byMsg.set(m, r);
  }
  mkdirSync(path("out/"), { recursive: true });
  writeFileSync(path(`out/${OUT || "promo"}-align.json`), JSON.stringify({ dsf: 2, samples: align }));
  console.log(`checked ${Math.ceil(dur / step)} moments: ${byMsg.size} layout problem(s)`);
  for (const [m, r] of byMsg) console.log(`  ${r.map(([a, b]) => (a === b ? a.toFixed(1) : `${a.toFixed(1)}-${b.toFixed(1)}`)).join(", ")} s: ${m}`);
} else if (mode === "frames") {
  mkdirSync(path(FRAMES), { recursive: true });
  mkdirSync(path("out/"), { recursive: true });
  // frames [workers] [fromSeconds] [toSeconds]: re-render part of the film after a change.
  const workers = Number(args[0] || 4);
  const pages = await Promise.all(Array.from({ length: workers }, openPage));
  const { cues, dur } = await pages[0].evaluate(() => ({ cues: window.CUES, dur: window.DURATION }));
  const cut = await pages[0].evaluate(() => window.CUT ?? null);
  writeFileSync(path(`out/${OUT || "promo"}-cues.json`), JSON.stringify({ fps: FPS, duration: dur, cut, cues }, null, 1));
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
        writeFileSync(path(`${FRAMES}${String(i + 1).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
        if (++done % 150 === 0) console.log(`${done}/${total} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`);
      }
    }),
  );
  console.log(`rendered ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
await browser.close();
