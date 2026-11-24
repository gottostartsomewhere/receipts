import type { Category } from "../types";

// Shops read by the generic reader: Receipts opens the order-history page with the person's
// own sign-in, loads the year, and Gemini Nano reads the orders off the page on the laptop.
// No per-shop scraping code, so a redesign does not break anything; only the address matters.

export interface CatalogShop {
  id: string;
  label: string;
  region: "IN" | "US";
  ordersUrl: string;
  origins: string[];
  /** Every order from this shop is in this category (food apps, grocery apps, rides). */
  category?: Category;
  /** Food apps name the restaurant on each order; everything else is the shop itself. */
  merchantFromPage?: boolean;
  /** The order list shows no item names; each order is logged as this. */
  genericItem?: string;
  /** Not yet checked against a real signed-in account. */
  beta: boolean;
}

export const CATALOG: CatalogShop[] = [
  // India
  { id: "flipkart", label: "Flipkart", region: "IN", ordersUrl: "https://www.flipkart.com/account/orders", origins: ["https://www.flipkart.com/*"], beta: false },
  { id: "myntra", label: "Myntra", region: "IN", ordersUrl: "https://www.myntra.com/my/orders", origins: ["https://www.myntra.com/*"], category: "fashion", beta: true },
  { id: "ajio", label: "Ajio", region: "IN", ordersUrl: "https://www.ajio.com/my-account/orders", origins: ["https://www.ajio.com/*"], category: "fashion", beta: true },
  { id: "tatacliq", label: "Tata CLiQ", region: "IN", ordersUrl: "https://www.tatacliq.com/my-account/orders", origins: ["https://www.tatacliq.com/*"], beta: true },
  { id: "blinkit", label: "Blinkit", region: "IN", ordersUrl: "https://blinkit.com/account/orders", origins: ["https://blinkit.com/*"], category: "groceries", genericItem: "Blinkit groceries", beta: false },
  { id: "jiomart", label: "JioMart", region: "IN", ordersUrl: "https://www.jiomart.com/customer/orderhistory", origins: ["https://www.jiomart.com/*"], category: "groceries", beta: true },
  { id: "bookmyshow", label: "BookMyShow", region: "IN", ordersUrl: "https://in.bookmyshow.com/my-profile/purchase-history", origins: ["https://in.bookmyshow.com/*"], category: "entertainment", beta: false },
  { id: "uber_in", label: "Uber rides", region: "IN", ordersUrl: "https://riders.uber.com/trips", origins: ["https://riders.uber.com/*"], category: "travel", beta: true },
  // US
  { id: "walmart", label: "Walmart", region: "US", ordersUrl: "https://www.walmart.com/orders", origins: ["https://www.walmart.com/*"], beta: true },
  { id: "target", label: "Target", region: "US", ordersUrl: "https://www.target.com/orders", origins: ["https://www.target.com/*"], beta: true },
  { id: "doordash", label: "DoorDash", region: "US", ordersUrl: "https://www.doordash.com/orders", origins: ["https://www.doordash.com/*"], category: "food_delivery", merchantFromPage: true, beta: true },
  { id: "ubereats", label: "Uber Eats", region: "US", ordersUrl: "https://www.ubereats.com/orders", origins: ["https://www.ubereats.com/*"], category: "food_delivery", merchantFromPage: true, beta: true },
  { id: "instacart", label: "Instacart", region: "US", ordersUrl: "https://www.instacart.com/store/account/orders", origins: ["https://www.instacart.com/*"], category: "groceries", beta: true },
  { id: "ebay", label: "eBay", region: "US", ordersUrl: "https://www.ebay.com/mye/myebay/purchase", origins: ["https://www.ebay.com/*"], beta: true },
  { id: "etsy", label: "Etsy", region: "US", ordersUrl: "https://www.etsy.com/your/purchases", origins: ["https://www.etsy.com/*"], beta: true },
  { id: "uber_us", label: "Uber rides", region: "US", ordersUrl: "https://riders.uber.com/trips", origins: ["https://riders.uber.com/*"], category: "travel", beta: true },
];

/**
 * Runs inside the shop's page (self-contained). Waits for the app to render, presses
 * "show more"-style buttons and scrolls until older years appear or nothing new loads, then
 * returns the page text. It only ever clicks buttons whose whole label is "show/load/view/see more".
 */
export async function loadOrdersPage(year: number, maxMs: number): Promise<{ status: "ok" | "signin" | "empty"; text: string; title: string }> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const start = Date.now();
  const root = () => (document.querySelector("main") as HTMLElement | null) ?? document.body;
  const onLogin = () => /\b(login|signin|sign-in|sign_in|auth)\b/i.test(location.href) || document.querySelector('input[type="password"]') !== null;
  // Only a real date with an older year counts ("Feb 16, 2025", "16 Feb 2025", "2025-02-16"),
  // not a bare "2025" in a filter sidebar.
  const olderYears = `(${year - 1}|${year - 2}|${year - 3})`;
  const months = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
  const older = new RegExp(
    `${months}\\s+\\d{1,2},?\\s+${olderYears}\\b|\\b\\d{1,2}\\s+${months}\\s+${olderYears}\\b|\\b${olderYears}-\\d{2}-\\d{2}\\b`,
    "i",
  );
  let lastLength = 0;
  let stableRounds = 0;
  while (Date.now() - start < maxMs) {
    await sleep(1200);
    const text = root().innerText;
    if (onLogin() && !/order|trip|purchase/i.test(text.slice(0, 5000))) return { status: "signin", text: "", title: document.title };
    const reachedOlder = older.test(text);
    window.scrollTo(0, document.body.scrollHeight);
    if (!reachedOlder) {
      // Many shops build this "button" out of a plain div, so look at any element whose whole
      // text is "show more", and click the innermost one.
      const label = /^(show|load|view|see) more( orders| trips| purchases| items)?$/i;
      const found = [...document.querySelectorAll<HTMLElement>("button, a, [role='button'], div, span")].filter(
        (el) => label.test((el.textContent ?? "").trim()) && el.offsetParent !== null,
      );
      const more = found.find((el) => !found.some((other) => other !== el && el.contains(other)));
      if (more) {
        more.click();
        stableRounds = 0;
      }
    }
    stableRounds = text.length === lastLength ? stableRounds + 1 : 0;
    lastLength = text.length;
    if (reachedOlder || stableRounds >= 3) break;
  }
  const text = root().innerText.replace(/\n{3,}/g, "\n\n").slice(0, 150_000);
  return { status: /order|trip|purchase|booking|delivered/i.test(text) ? "ok" : "empty", text, title: document.title };
}
