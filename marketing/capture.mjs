// Captures real Receipts screens for the store images.
// Usage: node marketing/capture.mjs  (with the built app served at http://localhost:4173)
//
// Playwright's Chrome profile has no Gemini Nano, so labels come from the local rules and the
// "ON DEVICE" stamps are restamped on the captured feed to show what the screen looks like with
// Nano (the markup is the app's own). Numbers come from the Chennai sample year.

import { chromium } from "file:///C:/Users/johnk/Desktop/Projects/recon-promo/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("./shots/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const out = (name) => new URL(name, OUT).pathname.replace(/^\/(\w:)/, "$1");

const browser = await chromium.launch({ channel: "chrome", args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
// Tall enough that every section is inside the viewport (clipped screenshots must be).
const page = await browser.newPage({ viewport: { width: 560, height: 4200 }, deviceScaleFactor: 2, colorScheme: "light" });
await page.goto("http://localhost:4173/app.html?shots=1");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(800);

const paper = page.locator("#paper");
const shotPaper = async (name, height) => {
  const box = await paper.boundingBox();
  await page.screenshot({ path: out(name), clip: { x: box.x, y: box.y, width: box.width, height: Math.min(height ?? box.height, box.height) } });
};

// 1. Start screen
await shotPaper("start.png", 900);

// 2. Run the Chennai sample year
await page.click('input[name="sample"][value="chennai"]');
await page.click("#start");
await page.waitForSelector("#screen-home:not([hidden])", { timeout: 60000 });

// 3. Reading screen, staged with the app's own markup as it looks with Gemini Nano
await page.evaluate(() => {
  for (const id of ["screen-start", "screen-home"]) document.getElementById(id).hidden = true;
  document.getElementById("screen-reading").hidden = false;
  document.getElementById("reading-title").textContent = "GEMINI NANO IS READING YOUR ITEMS";
  document.getElementById("reading-hint").textContent = "Turning product names into things you would recognise.";
  document.getElementById("elapsed").textContent = "0:41";
  document.getElementById("count-orders").textContent = "248";
  document.getElementById("count-items").textContent = "29";
  document.querySelector("#progress span").style.width = "78%";
  const rows = [
    ["Dindigul Chicken Dum Biryani", "biryani (Food delivery)"],
    ["Lazeez Bhuna Murgh Biryani", "biryani (Food delivery)"],
    ["Minimalist 10% Niacinamide Face Serum", "face serum (Beauty)"],
    ["Logitech M331 Silent Plus Wireless Mouse", "wireless mouse (Electronics)"],
    ["Ghee Roast Dosa", "dosa (Food delivery)"],
    ["Nike Revolution 7 Running Shoes", "running shoes (Fashion)"],
  ];
  const feed = document.getElementById("feed");
  feed.replaceChildren();
  for (const [name, became] of rows) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="what"></span><span class="amount"></span><span class="became"></span>`;
    li.querySelector(".what").textContent = name;
    const b = li.querySelector(".became");
    b.textContent = became + " ";
    const s = document.createElement("span");
    s.className = "stamp device";
    s.textContent = "ON DEVICE";
    b.append(s);
    feed.append(li);
  }
});
await page.waitForTimeout(400);
await shotPaper("reading.png", 980);

// 4. Your year: summary + review
await page.evaluate(() => {
  document.getElementById("screen-reading").hidden = true;
  document.getElementById("screen-home").hidden = false;
  window.scrollTo(0, 0);
});
await shotPaper("home.png", 1250);

// 5. Fees tab
await page.click("#tab-fees");
await page.waitForTimeout(300);
const feesTop = await page.locator("#tab-fees").boundingBox();
const paperBox = await paper.boundingBox();
await page.screenshot({ path: out("fees.png"), clip: { x: paperBox.x, y: feesTop.y - 10, width: paperBox.width, height: 900 } });
const chartTop = await page.locator(".month-chart").boundingBox();
await page.screenshot({ path: out("fees-member.png"), clip: { x: paperBox.x, y: chartTop.y - 40, width: paperBox.width, height: 560 } });

// 6. Ask tab, answered from the orders (restamped as with Nano)
await page.click("#tab-ask");
for (const q of ["How much did I pay in fees?", "How much did I spend on biryani?", "How many orders after 10pm?"]) {
  await page.fill("#ask-input", q);
  await page.press("#ask-input", "Enter");
  await page.waitForTimeout(400);
}
await page.evaluate(() => {
  document.querySelectorAll("#answers .stamp").forEach((s) => ((s.className = "stamp device"), (s.textContent = "ON DEVICE")));
  document.activeElement?.blur();
});
const askTop = await page.locator("#tab-ask").boundingBox();
await page.screenshot({ path: out("ask.png"), clip: { x: paperBox.x, y: askTop.y - 10, width: paperBox.width, height: 520 } });

// 7. Wrapped, written by Gemini from the rounded facts
await page.click("#tab-wrapped");
const reviewTop = await page.locator("#review").boundingBox();
await page.screenshot({ path: out("review.png"), clip: { x: paperBox.x, y: reviewTop.y - 10, width: paperBox.width, height: 760 } });
await page.click("#send");
await page.waitForSelector("#wrapped:not([hidden])", { timeout: 90000 });
await page.waitForTimeout(1500);
const cards = await page.$$eval(".card-shot img", (imgs) => imgs.map((i) => ({ alt: i.alt, src: i.src })));
cards.forEach((c, i) => writeFileSync(out(`card-${i + 1}.png`), Buffer.from(c.src.split(",")[1], "base64")));
writeFileSync(out("cards.json"), JSON.stringify(cards.map((c, i) => ({ file: `card-${i + 1}.png`, alt: c.alt })), null, 2));

// 8. What left this device
await page.evaluate(() => (document.getElementById("ledger").open = true));
await page.waitForTimeout(300);
const ledgerTop = await page.locator("#ledger").boundingBox();
await page.screenshot({ path: out("ledger.png"), clip: { x: paperBox.x, y: ledgerTop.y - 10, width: paperBox.width, height: Math.min(640, ledgerTop.height + 20) } });

await browser.close();
console.log("captured", cards.length, "cards");
