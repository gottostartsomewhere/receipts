// Films the real Receipts app with real Gemini Nano, for the promo and the 3-minute demo.
//   node promo/film.mjs        (with the built app served at http://localhost:4173)
//
// Chrome runs headless from promo/.chrome-nano, a profile holding a copy of this laptop's
// on-device model (see promo/README.md), launched without Playwright's automation switches,
// which turn Nano off. Nothing is staged: Nano reads the demo store page, labels a full sample
// year and parses the typed questions; Gemini in the cloud writes the Wrapped.
// The one thing shown that the web build can't run is the extension's shop list, which is the
// extension's own markup unhidden for the tour (the web build hides it).
//
// Output: promo/footage/raw/000001.jpg... (frames as Chrome paints them) and
// promo/footage/rec.js: window.REC = { frames: [[t, file]], marks, events, rects } in seconds
// from the start of recording, with rects in CSS pixels of the 688x728 viewport.
import { chromium } from "file:///C:/Users/johnk/Desktop/Projects/recon-promo/node_modules/playwright/index.mjs";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const APP = "http://localhost:4173/app.html";
const SHOP = "http://localhost:4173/demo-shop.html";
const VIEW = { width: 688, height: 728 };
const DSF = 2;
const here = new URL(".", import.meta.url);
const path = (rel) => new URL(rel, here).pathname.replace(/^\/(\w:)/, "$1");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

const cursorScript = () => {
  const install = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML =
      '<svg width="24" height="32" viewBox="0 0 24 32"><path d="M3 2 L3 25 L9 19.5 L13.5 29 L17.8 27 L13.4 18 L21.5 18 Z" fill="#1c1c1a" stroke="#fcfcfa" stroke-width="2" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-200px,-200px)" });
    const ring = document.createElement("div");
    Object.assign(ring.style, { position: "fixed", zIndex: "2147483646", pointerEvents: "none", width: "38px", height: "38px", marginLeft: "-19px", marginTop: "-19px", border: "3px solid #c8452f", borderRadius: "50%", opacity: "0" });
    document.documentElement.append(ring, c);
    let x = -200, y = -200;
    addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; c.style.transform = `translate(${x - 3}px,${y - 2}px)`; }, true);
    window.__ring = () => {
      ring.style.left = x + "px";
      ring.style.top = y + "px";
      ring.animate([{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.5)" }], { duration: 450, easing: "ease-out" });
    };
    addEventListener("mousedown", () => window.__ring(), true);
    const glideScroll = (get, set, to, ms) =>
      new Promise((res) => {
        const from = get(), t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / ms);
          set(from + (to - from) * (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2));
          p < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      });
    window.__scroll = (to, ms) => glideScroll(() => scrollY, (v) => scrollTo(0, v), Math.max(0, Math.min(to, document.documentElement.scrollHeight - innerHeight)), ms);
    window.__scrollX = (el, to, ms) => ((el.style.scrollSnapType = "none"), glideScroll(() => el.scrollLeft, (v) => (el.scrollLeft = v), to, ms));
    window.__top = (sel, off = 0) => document.querySelector(sel).getBoundingClientRect().top + scrollY - off;
    window.__rect = (sel) => {
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install);
  else install();
};

// ------------------------------------------------------------------------------------------
const dir = path(".chrome-nano/");
const ctx = await chromium.launchPersistentContext(dir, {
  channel: "chrome",
  headless: true,
  viewport: VIEW,
  deviceScaleFactor: DSF,
  colorScheme: "light",
  timezoneId: "Asia/Kolkata",
  ignoreDefaultArgs: true,
  args: [`--user-data-dir=${dir}`, "--headless=new", "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "about:blank"],
});
await ctx.addInitScript(cursorScript);
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("console", (m) => /error|fail/i.test(m.text()) && console.log("page:", m.text().slice(0, 200)));

// Fresh app state, and Nano loaded once so the film doesn't sit through the cold start.
await page.goto(APP);
await page.evaluate(() => localStorage.clear());
await page.evaluate(async () => {
  const s = await LanguageModel.create({ expectedOutputs: [{ type: "text", languages: ["en"] }] });
  await s.prompt("Say ok.");
  s.destroy();
});
console.log("nano warm");

// ---------- recording ----------
rmSync(path("footage/"), { recursive: true, force: true });
mkdirSync(path("footage/raw/"), { recursive: true });
const cdp = await ctx.newCDPSession(page);
const frames = [];
let T0 = 0;
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const t = (metadata?.timestamp ?? Date.now() / 1000) - T0;
  const file = String(frames.length + 1).padStart(6, "0") + ".jpg";
  writeFileSync(path(`footage/raw/${file}`), Buffer.from(data, "base64"));
  frames.push([Math.round(t * 1000) / 1000, file]);
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
const now = () => Date.now() / 1000 - T0;
const marks = {}, events = [], rects = [];
const mark = (k) => ((marks[k] = now()), console.log(`${now().toFixed(1)}s ${k}`));
const ev = (type, o = {}) => events.push({ t: now(), type, ...o });
async function rect(name, sel) {
  const r = await page.evaluate((s) => window.__rect(s), sel);
  if (r) rects.push({ t: now(), name, ...r });
}

let mx = VIEW.width * 0.7, my = VIEW.height * 0.8;
async function glide(x, y, ms = 420) {
  const x0 = mx, y0 = my, n = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    const p = ease(i / n);
    mx = x0 + (x - x0) * p;
    my = y0 + (y - y0) * p;
    await page.mouse.move(mx, my);
    await sleep(ms / n);
  }
}
async function glideTo(loc, ms, fx = 0.5, fy = 0.5) {
  const b = await loc.boundingBox();
  await glide(b.x + b.width * fx, b.y + b.height * fy, ms);
}
async function click() {
  await page.mouse.down();
  ev("click");
  await sleep(70);
  await page.mouse.up();
}
async function type(text, delay = 55) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    if (ch !== " ") ev("key");
    await sleep(delay);
  }
}
const scroll = (to, ms) => page.evaluate(([to, ms]) => window.__scroll(to, ms), [to, ms]);
const top = (sel, off) => page.evaluate(([s, o]) => window.__top(s, o), [sel, off]);
const park = () => glide(VIEW.width - 46, VIEW.height - 70, 450);

await page.goto(SHOP);
await page.waitForTimeout(600);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: VIEW.width * DSF, maxHeight: VIEW.height * DSF, everyNthFrame: 1 });
T0 = Date.now() / 1000;
await page.mouse.move(mx, my);

// 1. A shop's order page: orders with fees printed under them
mark("shop");
await sleep(1200);
await scroll(await top(".order:has(.charges)", 120), 1400);
await sleep(300);
await rect("shop-order", ".order:has(.charges)");
await rect("shop-charges", ".order:has(.charges) .charges");
await glideTo(page.locator(".order:has(.charges) .charges").first(), 600, 0.2, 0.5);
await sleep(1800);
await scroll((await top(".order:has(.charges)", 120)) + 700, 2600);
await sleep(600);

// 2. The start screen, with the extension's shop list
await page.goto(APP);
await page.waitForSelector("#start");
await page.evaluate(() => {
  document.querySelectorAll(".extension-only").forEach((e) => (e.hidden = false));
  document.getElementById("web-note").hidden = true;
});
await page.waitForFunction(() => /ready/i.test(document.getElementById("nano-state").textContent), null, { timeout: 60000 });
mark("start");
await sleep(900);
await scroll(await top("#shops-fieldset", 20), 800);
await rect("shops", "#shops-fieldset");
for (const name of ["Amazon.in", "Swiggy", "Flipkart", "Blinkit", "BookMyShow"]) {
  await glideTo(page.locator("label.shop", { hasText: name }).first(), 360, 0.08, 0.5);
  await click();
  await sleep(160);
}
await glideTo(page.locator(".more-shops summary"), 420, 0.2);
await click();
await sleep(500);
await rect("shops-all", "#shops-fieldset");
await sleep(1400);
await scroll(await top("#pages-fieldset", 30), 900);
await rect("any-shop", "#pages-fieldset");
await sleep(1600);
mark("start-end");

// 3. Real read of the demo store with Gemini Nano
await page.goto(APP);
await page.waitForSelector("#start");
await page.waitForFunction(() => /ready/i.test(document.getElementById("nano-state").textContent), null, { timeout: 60000 });
await scroll(await top("#start", 330), 700);
mark("demo");
await rect("nano-ready", ".line.status");
await glideTo(page.locator("#start"), 520);
await sleep(200);
await click();
mark("demo-read");
await park();
await sleep(800);
await rect("tally", ".tally");
await rect("feed", "#feed");
await page.waitForFunction(() => /READING YOUR ITEMS|UNDERSTANDING/i.test(document.getElementById("reading-title").textContent), null, { timeout: 600000 });
mark("demo-items");
await rect("feed-items", "#feed");
await page.waitForSelector("#screen-home:not([hidden])", { timeout: 600000 });
mark("demo-home");
await sleep(600);
await rect("summary", "#home-summary");
await sleep(1500);
await scroll(await top(".tabs", 60), 700);
await glideTo(page.locator("#tab-fees"), 450);
await click();
await sleep(500);
await rect("demo-fees", "#fees-receipt");
await scroll(await top("#fees-receipt", 70), 1200);
await sleep(2200);
mark("demo-end");

// 4. A full sample year, labelled by Nano
await scroll(0, 900);
await page.evaluate(() => document.getElementById("change-shops").scrollIntoView({ block: "center" }));
await sleep(300);
await glideTo(page.locator("#change-shops"), 450);
await click();
await sleep(600);
await page.evaluate(() => {
  document.querySelectorAll(".extension-only").forEach((e) => (e.hidden = true));
  document.getElementById("web-note").hidden = true;
});
await scroll(await top('input[name="sample"][value="chennai"]', 300), 700);
mark("sample");
await glideTo(page.locator('label.line:has(input[value="chennai"])'), 450, 0.2);
await click();
await sleep(300);
await glideTo(page.locator("#start"), 450);
await click();
mark("sample-read");
await park();
await page.waitForFunction(() => /READING YOUR ITEMS|UNDERSTANDING/i.test(document.getElementById("reading-title").textContent), null, { timeout: 600000 });
mark("sample-items");
await sleep(4000);
await rect("sample-feed", "#feed");
await page.waitForSelector("#screen-home:not([hidden])", { timeout: 900000 });
mark("sample-home");
await sleep(500);
await rect("sample-summary", "#home-summary");
await sleep(1800);

// 5. Fees
await scroll(await top(".tabs", 60), 700);
await glideTo(page.locator("#tab-fees"), 450);
mark("fees");
await click();
await sleep(500);
await rect("fee-total", ".fee-total");
await sleep(1300);
await scroll(await top(".month-chart", 50), 2600);
await sleep(400);
await rect("month-chart", ".month-chart");
await sleep(1200);
const feesBottom = await page.evaluate(() => document.getElementById("fees-receipt").getBoundingClientRect().bottom + scrollY - innerHeight + 30);
await scroll(feesBottom, 1600);
await sleep(400);
await rect("membership", "#fees-receipt");
await sleep(1600);
mark("fees-end");

// 6. Ask, with Nano reading the question
await scroll(await top(".tabs", 40), 900);
await glideTo(page.locator("#tab-ask"), 420);
mark("ask");
await click();
await sleep(400);
await rect("ask-input", "#ask-form");
await glideTo(page.locator("#ask-input"), 380, 0.3);
await click();
await type("How much did I spend on biryani?");
await sleep(200);
await page.keyboard.press("Enter");
ev("click");
await page.waitForSelector("#answers li .stamp", { timeout: 60000 });
await sleep(700);
await rect("answer-1", "#answers li:first-child");
await sleep(1400);
await glideTo(page.locator("#ask-input"), 380, 0.3);
await click();
await type("How many orders after 10pm?");
await page.keyboard.press("Enter");
ev("click");
await page.waitForFunction(() => document.querySelectorAll("#answers li .stamp").length >= 2, null, { timeout: 60000 });
await sleep(700);
await rect("answer-2", "#answers li:first-child");
await sleep(1200);
await glideTo(page.locator("#ask-chips button").first(), 520);
await click();
await page.waitForFunction(() => document.querySelectorAll("#answers li .stamp").length >= 3, null, { timeout: 60000 });
await sleep(700);
await rect("answer-3", "#answers li:first-child");
await sleep(1500);
mark("ask-end");

// 7. Approve what leaves, then the Wrapped
await scroll(await top(".tabs", 40), 700);
await glideTo(page.locator("#tab-wrapped"), 450);
mark("approve");
await click();
await sleep(400);
await scroll(await top("#review", 20), 900);
await sleep(300);
await rect("review", "#review");
await sleep(1200);
await scroll(await top("#send", 520), 2000);
await sleep(300);
await rect("payload", "#payload");
await rect("send", "#send");
await sleep(900);
await glideTo(page.locator("#send"), 500);
await sleep(200);
await click();
mark("send");
await page.waitForSelector("#wrapped:not([hidden])", { timeout: 120000 });
await sleep(400);
mark("wrapped");
await scroll(await top("#wrapped", 20), 900);
await park();
await rect("cards", "#cards");
await sleep(900);
for (let k = 1; k <= 4; k++) {
  await page.evaluate((k) => {
    const el = document.getElementById("cards");
    const card = el.children[k];
    return window.__scrollX(el, card.offsetLeft - (el.clientWidth - card.clientWidth) / 2, 600);
  }, k);
  ev("swipe");
  await sleep(800);
}
await scroll(await top("#roast", 120), 1000);
await sleep(1600);
mark("wrapped-end");

// 8. What left this device
await scroll(await top("#ledger", 240), 1200);
await glideTo(page.locator("#ledger summary"), 450, 0.3);
mark("ledger");
await click();
await sleep(500);
await scroll(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), 900);
await sleep(300);
await rect("ledger-body", "#ledger-body");
await sleep(2500);
mark("end");

await cdp.send("Page.stopScreencast");
await ctx.close();
writeFileSync(path("footage/rec.js"), `window.REC = ${JSON.stringify({ w: VIEW.width, h: VIEW.height, dsf: DSF, frames, marks, events, rects })};\n`);
console.log(`filmed ${frames.length} frames over ${now().toFixed(1)} s`);
