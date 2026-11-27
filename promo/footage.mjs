// Films the real Receipts app being used, for the live section of the promo.
//   node promo/footage.mjs        (with the built app served at http://localhost:4173)
// Writes promo/footage/frames/00001.jpg... at 30 fps and promo/footage/edit.js (step times and
// click/key events, in the edited timeline) for promo.js and sound.py.
//
// Everything on screen is the app's own page, driven with a real mouse and keyboard: shop
// ticking, tabs, the fees receipt, typed questions answered by the app, the Wrapped written by
// Gemini in the cloud, the ledger. Two things are staged, as in marketing/capture.mjs, because
// Playwright's Chrome has no Gemini Nano and no signed-in shops: the reading screen (the app's
// own markup, filled the way a Nano run fills it) and "ON DEVICE" stamps in place of the
// "LOCAL RULES" stamps the no-Nano fallback prints. The year itself is the Chennai sample.
import { chromium } from "file:///C:/Users/johnk/Desktop/Projects/recon-promo/node_modules/playwright/index.mjs";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const APP = "http://localhost:4173/app.html";
const FPS = 30;
const VIEW = { width: 688, height: 728 };
const DSF = 1.25;
const here = new URL(".", import.meta.url);
const path = (rel) => new URL(rel, here).pathname.replace(/^\/(\w:)/, "$1");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// A drawn cursor (headless screenshots have none) and a ring on every press.
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
    window.__scroll = (to, ms) =>
      new Promise((res) => {
        const from = scrollY, t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / ms);
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          scrollTo(0, from + (to - from) * e);
          p < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      });
    window.__scrollX = (el, to, ms) =>
      new Promise((res) => {
        el.style.scrollSnapType = "none";
        const from = el.scrollLeft, t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / ms);
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          el.scrollLeft = from + (to - from) * e;
          p < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      });
    window.__top = (sel, off = 0) => document.querySelector(sel).getBoundingClientRect().top + scrollY - off;
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install);
  else install();
};

// The reading screen, filled the way a run with Gemini Nano fills it (the app's own markup).
const fakeRead = async () => {
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const feed = $("feed");
  const line = (what, amount, became) => {
    const li = document.createElement("li");
    li.innerHTML = '<span class="what"></span><span class="amount"></span>';
    li.querySelector(".what").textContent = what;
    li.querySelector(".amount").textContent = amount;
    if (became) {
      const b = document.createElement("span");
      b.className = "became";
      b.textContent = became + " ";
      const s = document.createElement("span");
      s.className = "stamp device";
      s.textContent = "ON DEVICE";
      b.append(s);
      li.append(b);
    }
    feed.prepend(li);
    while (feed.children.length > 14) feed.lastElementChild.remove();
  };
  const prog = (p) => ($("progress").firstElementChild.style.width = Math.round(p * 100) + "%");
  feed.replaceChildren();
  $("count-orders").textContent = "0";
  $("count-items").textContent = "0";
  prog(0);
  $("screen-start").hidden = true;
  $("screen-reading").hidden = false;
  scrollTo(0, 0);
  let sec = 0;
  $("elapsed").textContent = "0:00";
  const tick = setInterval(() => ($("elapsed").textContent = `0:${String(++sec).padStart(2, "0")}`), 1000);
  const SHOPS = [
    ["AMAZON.IN", "Amazon.in", 41, [["Amazon", "₹1,299"], ["Amazon", "₹549"]]],
    ["SWIGGY", "Swiggy", 176, [["Hotel Junior Kuppanna (Swiggy)", "₹486"], ["Thalappakatti (Swiggy)", "₹712"], ["Behrouz Biryani (Swiggy)", "₹644"]]],
    ["BLINKIT", "Blinkit", 49, [["Blinkit: Blinkit groceries", "₹212"], ["Blinkit: Blinkit groceries", "₹96"]]],
    ["BOOKMYSHOW", "BookMyShow", 9, [["PVR Grand Galada: Movie tickets", "₹620"]]],
  ];
  let count = 0;
  for (const [i, [T, label, n, rows]] of SHOPS.entries()) {
    $("reading-title").textContent = `READING ${T}`;
    $("reading-hint").textContent = `${label}: reading your order history in a background tab.`;
    line(`Opening ${label} in a background tab`, "");
    await wait(300);
    for (const [k, [m, a]] of rows.entries()) {
      line(m, a);
      $("count-orders").textContent = String(count + Math.round((n * (k + 1)) / rows.length));
      prog((i + (k + 1) / rows.length) / SHOPS.length);
      await wait(190);
    }
    count += n;
    $("count-orders").textContent = String(count);
    line(`${label}: ${n} orders, each checked against the page`, "DONE");
    await wait(260);
  }
  $("reading-title").textContent = "GEMINI NANO IS READING YOUR ITEMS";
  $("reading-hint").textContent = "Turning product names into things you would recognise.";
  prog(0);
  const ITEMS = [
    ["Mutton Chukka", "mutton chukka (Food delivery)"],
    ["Dindigul Chicken Dum Biryani", "biryani (Food delivery)"],
    ["Amul Taaza Toned Milk 1L", "toned milk (Groceries)"],
    ["Logitech M331 Silent Plus Wireless Mouse", "wireless mouse (Electronics)"],
    ["Ghee Roast Dosa", "dosa (Food delivery)"],
    ["Maggi 2-Minute Masala Noodles (Pack of 12)", "instant noodles (Groceries)"],
    ["Minimalist 10% Niacinamide Face Serum", "face serum (Beauty)"],
    ["Movie tickets", "movie tickets (Entertainment)"],
    ["Nike Revolution 7 Running Shoes", "running shoes (Fashion)"],
    ["Apple AirPods Pro (3rd generation)", "earbuds (Electronics)"],
    ["Parotta (2 pcs)", "parotta (Food delivery)"],
    ["Aashirvaad Shudh Chakki Atta 5kg", "atta (Groceries)"],
  ];
  for (let k = 0; k < ITEMS.length; k++) {
    line(ITEMS[k][0], "", ITEMS[k][1]);
    $("count-items").textContent = String(Math.round(((k + 1) / ITEMS.length) * 63));
    prog((k + 1) / ITEMS.length);
    await wait(320);
  }
  clearInterval(tick);
  await wait(350);
};

// ------------------------------------------------------------------------------------------
const browser = await chromium.launch({ channel: "chrome", args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DSF, colorScheme: "light", timezoneId: "Asia/Kolkata" });
await ctx.addInitScript(cursorScript);
const page = await ctx.newPage();
await page.goto(APP);
await page.evaluate(() => localStorage.clear());
await page.reload();
// Print the Chennai year once (not filmed), so the app has a saved year to show.
await page.click('input[name="sample"][value="chennai"]');
await page.click("#start");
await page.waitForSelector("#screen-home:not([hidden])", { timeout: 60000 });
await page.reload();
await page.waitForSelector("#screen-home:not([hidden])", { timeout: 60000 });
await page.waitForTimeout(600);

// The start screen as the extension shows it, Nano ready, nothing ticked yet.
await page.evaluate(() => {
  document.querySelectorAll(".extension-only").forEach((e) => (e.hidden = false));
  document.getElementById("web-note").hidden = true;
  document.getElementById("nano-state").textContent = "READY";
  document.getElementById("cloud-optin").hidden = true;
  document.getElementById("back-home").hidden = true;
  document.querySelectorAll('input[name="shop"]').forEach((i) => (i.checked = false));
  document.getElementById("screen-home").hidden = true;
  document.getElementById("screen-start").hidden = false;
  document.getElementById("start").textContent = "READ THE DEMO STORE";
  // What a run over these four shops reports in place of the sample year's name.
  for (const dt of document.querySelectorAll("#home-summary dt")) if (/read from/i.test(dt.textContent)) dt.parentElement.querySelector("dd").textContent = "4 shops";
  // With Nano, stamps read ON DEVICE; this Chrome has no Nano, so restamp what the fallback prints.
  // The ledger counts what this page did since it loaded; show what the filmed run would leave.
  const LEDGER = { "orders read on this laptop": "275", "items read on this laptop": "659", "gemini nano calls (on device)": "6" };
  const fix = () => {
    document.querySelectorAll("#answers .stamp:not(.device), #feed .stamp:not(.device)").forEach((s) => ((s.className = "stamp device"), (s.textContent = "ON DEVICE")));
    document.querySelectorAll("#ledger-body .row").forEach((r) => {
      const v = LEDGER[r.firstElementChild?.textContent.trim().toLowerCase()];
      if (v && r.lastElementChild.textContent !== v) r.lastElementChild.textContent = v;
    });
  };
  new MutationObserver(fix).observe(document.body, { subtree: true, childList: true, characterData: true });
  fix();
  scrollTo(0, 0);
});

// ---------- recording ----------
const cdp = await ctx.newCDPSession(page);
const raw = [];
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  raw.push({ t: metadata?.timestamp ?? Date.now() / 1000, data });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: Math.round(VIEW.width * DSF), maxHeight: Math.round(VIEW.height * DSF), everyNthFrame: 1 });
await sleep(300);
const T0 = Date.now() / 1000;
const now = () => Date.now() / 1000 - T0;
const marks = {}, events = [];
const mark = (k) => (marks[k] = now());
const ev = (type, o = {}) => events.push({ t: now(), type, ...o });

let mx = VIEW.width / 2, my = VIEW.height * 0.75;
await page.mouse.move(mx, my);
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
const scroll = (to, ms) => page.evaluate(([to, ms]) => window.__scroll(to, ms), [to, ms]);
const top = (sel, off) => page.evaluate(([s, o]) => window.__top(s, o), [sel, off]);

// 1. Tick the shops
mark("tick");
await sleep(500);
await scroll(await top("#shops-fieldset", 24), 700);
for (const name of ["Amazon.in", "Swiggy", "Blinkit", "BookMyShow"]) {
  await glideTo(page.locator("label.shop", { hasText: name }).first(), 380, 0.08, 0.5);
  await click();
  await sleep(180);
}
await sleep(250);
await scroll(await top("#start", 420), 800);
await glideTo(page.locator("#start"), 520);
await sleep(150);
await page.evaluate(() => window.__ring());
ev("click");
await sleep(260);

// 2. Reading, on the laptop
mark("read");
await glide(VIEW.width - 70, VIEW.height - 90, 500);
const readStart = now();
await page.evaluate(fakeRead);
const readEnd = now();
ev("feed", { from: readStart, to: readEnd });

// 3. The year and its fees
await page.evaluate(() => {
  document.getElementById("screen-reading").hidden = true;
  document.getElementById("screen-home").hidden = false;
  scrollTo(0, 0);
});
mark("fees");
await sleep(900);
await scroll(await top(".tabs", 120), 700);
await glideTo(page.locator("#tab-fees"), 450);
await click();
await sleep(500);
await scroll(await top(".month-chart", 40), 2600);
await sleep(500);
const feesBottom = await page.evaluate(() => document.getElementById("fees-receipt").getBoundingClientRect().bottom + scrollY - innerHeight + 30);
await scroll(feesBottom, 1600);
await sleep(900);

// 4. Ask
await scroll(await top(".tabs", 40), 900);
mark("ask");
await glideTo(page.locator("#tab-ask"), 420);
await click();
await sleep(350);
await glideTo(page.locator("#ask-input"), 380, 0.3);
await click();
await sleep(200);
for (const ch of "How much did I spend on biryani?") {
  await page.keyboard.type(ch);
  if (ch !== " ") ev("key");
  await sleep(48);
}
await sleep(250);
await page.keyboard.press("Enter");
ev("click");
await sleep(1300);
await glideTo(page.locator("#ask-chips button").first(), 520);
await click();
await sleep(1500);

// 5. You approve what leaves
await glideTo(page.locator("#tab-wrapped"), 450);
mark("approve");
await click();
await sleep(400);
await scroll(await top("#review", 30), 900);
await sleep(500);
await scroll(await top("#send", 470), 2000);
await sleep(300);
await glideTo(page.locator("#send"), 500);
await sleep(150);
await click();
const sendAt = now();
await page.waitForSelector("#wrapped:not([hidden])", { timeout: 90000 });
await page.waitForTimeout(400);
const sentAt = now();

// 6. The Wrapped
mark("wrapped");
await scroll(await top("#wrapped", 20), 900);
await glide(VIEW.width - 60, VIEW.height - 60, 400);
await sleep(700);
for (let k = 1; k <= 3; k++) {
  await page.evaluate((k) => {
    const el = document.getElementById("cards");
    const card = el.children[k];
    return window.__scrollX(el, card.offsetLeft - (el.clientWidth - card.clientWidth) / 2, 600);
  }, k);
  ev("swipe");
  await sleep(750);
}

// 7. The ledger
await scroll(await top("#ledger", 260), 1200);
mark("ledger");
await glideTo(page.locator("#ledger summary"), 450, 0.3);
await click();
await sleep(450);
await scroll(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), 900);
await sleep(1800);
const endAt = now();

await cdp.send("Page.stopScreencast");
await browser.close();

// ---------- edit: cut the wait for Gemini, resample to 30 fps ----------
const frames = raw.map((f) => ({ ...f, t: f.t - T0 })).sort((a, b) => a.t - b.t);
const segments = [[0, sendAt + 0.35], [sentAt - 0.1, endAt]];
const out = path("footage/frames/");
rmSync(path("footage/"), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const toEdited = (t) => {
  let acc = 0;
  for (const [a, b] of segments) {
    if (t >= a && t <= b) return acc + (t - a);
    acc += b - a;
  }
  return null;
};
const total = segments.reduce((n, [a, b]) => n + (b - a), 0);
const N = Math.floor(total * FPS);
let j = 0;
for (let k = 0; k < N; k++) {
  const te = k / FPS;
  let acc = 0, src = 0;
  for (const [a, b] of segments) {
    if (te <= acc + (b - a)) { src = a + (te - acc); break; }
    acc += b - a;
  }
  while (j + 1 < frames.length && frames[j + 1].t <= src) j++;
  writeFileSync(path(`footage/frames/${String(k + 1).padStart(5, "0")}.jpg`), Buffer.from(frames[j].data, "base64"));
}
const steps = Object.fromEntries(Object.entries(marks).map(([k, t]) => [k, toEdited(t)]));
const evs = events
  .map((e) => ({ ...e, t: toEdited(e.t), ...(e.from != null ? { from: toEdited(e.from), to: toEdited(e.to) } : {}) }))
  .filter((e) => e.t != null);
const edit = { fps: FPS, frames: N, duration: N / FPS, width: Math.round(VIEW.width * DSF), height: Math.round(VIEW.height * DSF), steps, events: evs };
writeFileSync(path("footage/edit.js"), `window.FOOTAGE = ${JSON.stringify(edit)};\n`);
console.log(`footage: ${raw.length} captured frames, ${N} frames out (${(N / FPS).toFixed(1)} s), cut ${(sentAt - sendAt).toFixed(1)} s of waiting`);
console.log(JSON.stringify(steps));
