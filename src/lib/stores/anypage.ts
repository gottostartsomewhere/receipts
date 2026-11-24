// "Read any store": Gemini Nano pulls orders out of the text of any order-history page, on the
// laptop. Every order it reports is checked against the page text before it is kept, so the
// model cannot add purchases that are not there.

import { extractModel } from "../firebase";
import { recordOnDevice } from "../ledger";
import type { Currency, Order } from "../types";
import type { PageGrab } from "./pages";

export interface ExtractedOrder {
  date: string;
  total: number;
  status: "delivered" | "cancelled" | "refunded";
  merchant: string;
  items: string[];
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

/** "2026-03-14|1299|delivered|Flipkart|Boat earbuds; Phone case" */
export function parseOrderLine(line: string): ExtractedOrder | null {
  const parts = line.split("|").map((p) => p.trim());
  if (parts.length < 5) return null;
  const [date, total, status, merchant, ...rest] = parts;
  if (!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) || Number.isNaN(Date.parse(date))) return null;
  const amount = Number(total.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const s = status.toLowerCase();
  const items = rest.join("|").split(";").map((x) => x.trim()).filter(Boolean);
  return {
    date,
    total: amount,
    status: s.startsWith("cancel") ? "cancelled" : s.startsWith("return") ? "refunded" : "delivered",
    merchant: merchant || "",
    items,
  };
}

const squash = (s: string) => s.toLowerCase().replace(/[\s,]/g, "");

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

export function detectCurrency(text: string): Currency {
  const rupees = (text.match(/₹|\bRs\.?|\bINR\b/g) ?? []).length;
  const dollars = (text.match(/\$|\bUSD\b/g) ?? []).length;
  return dollars > rupees ? "USD" : "INR";
}

function siteName(host: string): string {
  const base = host.replace(/^(www|m)\./, "").split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export async function readPage(page: PageGrab, year: number, onOrder: (o: Order) => void, signal?: AbortSignal): Promise<Order[]> {
  const currency = detectCurrency(page.text);
  const model = extractModel(year);
  const seen = new Set<string>();
  const orders: Order[] = [];
  for (const chunk of chunkText(page.text)) {
    if (signal?.aborted) break;
    const result = await model.generateContentStream(chunk, { signal });
    let buffer = "";
    const take = (line: string) => {
      if (!line.trim()) return;
      const parsed = parseOrderLine(line);
      const o = parsed && groundOrder(parsed, chunk);
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
      const order: Order = {
        id: `web-${page.host}-${key}`,
        store: "web",
        merchant: merchant || siteName(page.host),
        date: o.date,
        total: o.total,
        currency,
        status: o.status,
        items: items.map((name) => ({ name, qty: 1 })),
      };
      orders.push(order);
      onOrder(order);
    };
    for await (const part of result.stream) {
      buffer += part.text();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        take(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    take(buffer);
    await recordOnDevice();
  }
  return orders;
}
