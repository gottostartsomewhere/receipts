// "Read any store": Gemini Nano pulls orders out of the text of any order-history page, on the
// laptop. Every order it reports is checked against the page text before it is kept, so the
// model cannot add purchases that are not there.

import { CLOUD_LABEL_MODEL, extractModel } from "../firebase";
import { recordCloud, recordOnDevice } from "../ledger";
import { normalizeFeeLabel, type Category, type Currency, type Fee, type Order } from "../types";
import type { PageGrab } from "./pages";

export interface ExtractedOrder {
  date: string;
  total: number;
  status: "delivered" | "cancelled" | "refunded";
  fees: Fee[];
  merchant: string;
  items: string[];
}

/** "delivery fee 2.99; service fee 1.75" -> fees, with the label as Nano wrote it. "-" -> none. */
export function parseFees(text: string): Fee[] {
  if (!text || text.trim() === "-") return [];
  return text
    .split(";")
    .map((part) => /^\s*([a-z][a-z ]*?)\s+(\d{1,5}(?:\.\d{1,2})?)\s*$/i.exec(part))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ label: m[1].toLowerCase().trim(), amount: Number(m[2]) }))
    .filter((f) => f.amount > 0);
}

/**
 * Keeps a fee only if its amount is on the page and the page uses its name, then files it
 * under a common name ("packaging charges" and "packing charges" are one bucket).
 */
export function groundFees(fees: Fee[], pageText: string): Fee[] {
  const flat = pageText.toLowerCase().replace(/,/g, "");
  return fees
    .filter((f) => {
      const amountOnPage = flat.includes(f.amount.toFixed(2)) || flat.includes(String(f.amount));
      const word = f.label.split(" ")[0];
      return amountOnPage && flat.includes(word.slice(0, 4));
    })
    .map((f) => ({ label: normalizeFeeLabel(f.label), amount: f.amount }));
}

/** Splits page text at line breaks into pieces Nano can take in one go. */
export function chunkText(text: string, max = 3500): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    const piece = line.length > max ? line.slice(0, max) : line;
    if (cur.length + piece.length + 1 > max && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + piece;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** "2026-03-14|1299|delivered|delivery fee 40|Flipkart|Boat earbuds; Phone case" */
export function parseOrderLine(line: string): ExtractedOrder | null {
  const parts = line.split("|").map((p) => p.trim());
  if (parts.length < 6) return null;
  const [date, total, status, fees, merchant, ...rest] = parts;
  if (!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) || Number.isNaN(Date.parse(date))) return null;
  const amount = Number(total.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const s = status.toLowerCase();
  const items = rest.join("|").split(";").map((x) => x.trim()).filter(Boolean);
  return {
    date,
    total: amount,
    status: s.startsWith("cancel") ? "cancelled" : s.startsWith("return") ? "refunded" : "delivered",
    fees: parseFees(fees),
    merchant: merchant || "",
    items,
  };
}

const squash = (s: string) => s.toLowerCase().replace(/[\s,]/g, "");

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Picks the year from the page, not from the model. Shops print "Delivered on Feb 16" for this
 * year and "19 Apr 2025" for older orders, while filter sidebars list bare years like "2024".
 * If every place the page shows this day and month carries the same year, that year wins;
 * if the page shows it without a year, it is the current year.
 */
export function groundYear(date: string, pageText: string, year: number): string | null {
  const [, m, d] = date.split("-");
  const mon = MONTH_NAMES[Number(m) - 1];
  const day = String(Number(d));
  const t = pageText.toLowerCase();
  if (new RegExp(`\\b(20\\d\\d)-${m}-${d}\\b`).test(t)) {
    const iso = new RegExp(`\\b(20\\d\\d)-${m}-${d}\\b`).exec(t)!;
    return `${iso[1]}-${m}-${d}`;
  }
  const re = new RegExp(`(?:\\b0?${day}(?:st|nd|rd|th)?\\s+${mon}[a-z]*\\.?|\\b${mon}[a-z]*\\.?\\s+0?${day}(?:st|nd|rd|th)?\\b)(?:,?\\s+(20\\d\\d))?`, "g");
  const years: (string | undefined)[] = [];
  for (const match of t.matchAll(re)) years.push(match[1]);
  // A date that is nowhere on the page was made up (promo banners have prices but no dates).
  if (years.length === 0) return null;
  const explicit = years.filter(Boolean) as string[];
  if (explicit.length === years.length && new Set(explicit).size === 1) return `${explicit[0]}-${m}-${d}`;
  return `${year}-${m}-${d}`;
}

/**
 * Keeps an order only if its total appears on the page and at least one item does too.
 * Items that do not appear are dropped.
 */
export function groundOrder(o: ExtractedOrder, pageText: string): ExtractedOrder | null {
  const flat = squash(pageText);
  const whole = String(Math.floor(o.total));
  if (!flat.includes(whole)) return null;
  const lower = pageText.toLowerCase();
  const items = o.items.filter((name) =>
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4)
      .some((w) => lower.includes(w)),
  );
  if (items.length === 0) return null;
  const merchant = o.merchant && lower.includes(o.merchant.toLowerCase().split(" ")[0]) ? o.merchant : "";
  return { ...o, items, merchant };
}

/** For shops that list no item names: keep the order only if its total is on the page. */
export function groundTotal(o: ExtractedOrder, pageText: string): ExtractedOrder | null {
  return squash(pageText).includes(String(Math.floor(o.total))) ? o : null;
}

export function detectCurrency(text: string): Currency {
  const rupees = (text.match(/₹|\bRs\.?|\bINR\b/g) ?? []).length;
  const dollars = (text.match(/\$|\bUSD\b/g) ?? []).length;
  return dollars > rupees ? "USD" : "INR";
}

function siteName(host: string): string {
  const base = host.replace(/^(www|m)\./, "").split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export interface ReadPageOptions {
  /** Shop name to use for every order (catalog shops). */
  shopName?: string;
  /** Keep the restaurant Nano reads off the page (food apps). */
  merchantFromPage?: boolean;
  /** Every order from this shop is in this category. */
  category?: Category;
  /**
   * For shops whose order list shows no item names (Blinkit shows price, date and "arrived in
   * 6 minutes"): use this as the item and check only the total against the page.
   */
  genericItem?: string;
  /** The made-up demo store: the cloud may read it if this machine has no Nano. */
  demoPage?: boolean;
}

export async function readPage(
  page: PageGrab,
  year: number,
  onOrder: (o: Order) => void,
  signal?: AbortSignal,
  opts: ReadPageOptions = {},
): Promise<Order[]> {
  const currency = detectCurrency(page.text);
  const model = extractModel(year, opts.demoPage);
  const seen = new Set<string>();
  const orders: Order[] = [];
  for (const chunk of chunkText(page.text)) {
    if (signal?.aborted) break;
    const result = await model.generateContentStream(chunk, { signal });
    let buffer = "";
    // Fees are attached once the whole chunk is read, so each fee can be checked against its
    // own order's part of the page (see assignFees). Orders still print as they arrive.
    const pending: { order: Order; fees: Fee[] }[] = [];
    const take = (line: string) => {
      if (!line.trim()) return;
      const raw = parseOrderLine(line);
      const parsed = raw && opts.genericItem ? { ...raw, merchant: "", items: [opts.genericItem] } : raw;
      const grounded = parsed && (opts.genericItem ? groundTotal(parsed, chunk) : groundOrder(parsed, chunk));
      const date = grounded && groundYear(grounded.date, chunk, year);
      const o = grounded && date ? { ...grounded, date } : null;
      if (!o || !o.date.startsWith(String(year))) {
        console.debug("Receipts: dropped a line Nano wrote", { line, parsed: Boolean(parsed), grounded: Boolean(o) });
        return;
      }
      // Nano sometimes splits a brand off as the "merchant" ("Boat" + "Airdopes 141"). If the two
      // sit together on the page, they were one product name, and the shop is the site itself.
      let { merchant, items } = o;
      if (merchant && items[0] && chunk.toLowerCase().includes(`${merchant} ${items[0]}`.toLowerCase())) {
        items = [`${merchant} ${items[0]}`, ...items.slice(1)];
        merchant = "";
      }
      const key = `${o.date}|${o.total}|${items[0]}`;
      if (seen.has(key)) return;
      seen.add(key);
      const shop = opts.shopName ?? siteName(page.host);
      const useMerchant = opts.shopName ? opts.merchantFromPage : true;
      const order: Order = {
        id: `web-${page.host}-${key}`,
        store: "web",
        merchant: useMerchant && merchant ? (opts.shopName ? `${merchant} (${opts.shopName})` : merchant) : shop,
        knownCategory: opts.category,
        date: o.date,
        total: o.total,
        currency,
        status: o.status,
        items: items.map((name) => ({ name, qty: 1 })),
        fees: [],
      };
      orders.push(order);
      pending.push({ order, fees: o.fees });
      onOrder(order);
    };
    let inCloud = false;
    for await (const part of result.stream) {
      if (part.inferenceSource === "in_cloud" && !inCloud) {
        inCloud = true;
        await recordCloud({ purpose: "Read the demo store page (made-up orders, no Nano here)", model: CLOUD_LABEL_MODEL, sent: chunk });
      }
      buffer += part.text();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        take(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    take(buffer);
    assignFees(pending, chunk);
    if (!inCloud) await recordOnDevice();
  }
  return orders;
}

/**
 * A fee only counts if it is printed inside its own order's part of the page: from where that
 * order's first item appears to where the next order's first item appears. Orders are found in
 * page order, so a repeated item ("Pad Thai" three times) is matched to the right occurrence.
 */
export function assignFees(pending: { order: Order; fees: Fee[] }[], chunk: string): void {
  const lower = chunk.toLowerCase();
  let cursor = 0;
  const anchored = pending.map((p) => {
    const name = (p.order.items[0]?.name ?? "").toLowerCase();
    const probe = name.slice(0, Math.min(18, name.length));
    let at = probe ? lower.indexOf(probe, cursor) : -1;
    if (at < 0 && probe) at = lower.indexOf(probe);
    if (at < 0) at = lower.indexOf(String(Math.floor(p.order.total)));
    if (at >= 0) cursor = at + 1;
    return { ...p, at };
  });
  const sorted = anchored.filter((a) => a.at >= 0).sort((a, b) => a.at - b.at);
  sorted.forEach((a, i) => {
    const end = i + 1 < sorted.length ? sorted[i + 1].at : chunk.length;
    a.order.fees = groundFees(a.fees, chunk.slice(a.at, end));
  });
}
