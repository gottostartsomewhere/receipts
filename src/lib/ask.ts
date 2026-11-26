// "Ask your receipts". Gemini Nano only translates the question into a tiny query; the answer
// is calculated here from the orders, so the number is exact and nothing leaves the laptop.

import { formatMoney, normalizeName } from "./summary";
import { CATEGORY_NAMES, type Category, type ItemLabel, type Order } from "./types";

export type Metric = "spend" | "orders" | "times" | "biggest" | "fees";

export interface Query {
  metric: Metric;
  item?: string;
  category?: Category;
  merchant?: string;
  month?: number;
  night?: boolean;
}

export const ASK_SHORT_CATEGORIES: Record<string, Category> = {
  food: "food_delivery",
  grocery: "groceries",
  snack: "snacks",
  tech: "electronics",
  fashion: "fashion",
  book: "books",
  home: "home",
  beauty: "beauty",
  travel: "travel",
  fun: "entertainment",
  stationery: "stationery",
  other: "other",
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Parses Nano's one line: metric|item|category|merchant|month|time ("-" for none). */
export function parseQueryLine(line: string): Query | null {
  const parts = line.trim().split("|").map((p) => p.trim().toLowerCase());
  if (parts.length < 6) return null;
  const [metric, item, cat, merchant, month, time] = parts;
  if (!["spend", "orders", "times", "biggest", "fees"].includes(metric)) return null;
  const q: Query = { metric: metric as Metric };
  if (item && item !== "-") q.item = item;
  if (cat && cat !== "-" && ASK_SHORT_CATEGORIES[cat]) q.category = ASK_SHORT_CATEGORIES[cat];
  if (merchant && merchant !== "-") q.merchant = merchant;
  const m = Number(month);
  if (m >= 1 && m <= 12) q.month = m;
  if (time === "night") q.night = true;
  return q;
}

/**
 * Keeps only the parts of Nano's query that the question actually mentions, so a slip like
 * reading "10pm" as October cannot change the answer.
 */
export function groundQuery(query: Query, question: string): Query {
  const q = question.toLowerCase();
  const out: Query = { metric: query.metric };
  const stem = (s: string) => s.toLowerCase().split(/\s+/).filter((w) => w.length >= 3).map((w) => w.slice(0, 4));
  if (query.item && stem(query.item).some((w) => q.includes(w))) out.item = query.item;
  if (query.merchant && !/\b(pm|am|night|after|late)\b/.test(query.merchant) && stem(query.merchant).some((w) => q.includes(w))) out.merchant = query.merchant;
  if (query.month && new RegExp(`\\b(${MONTHS[query.month - 1]}|${MONTHS[query.month - 1].slice(0, 3)})\\b`).test(q)) out.month = query.month;
  if (query.night && /night|pm\b|late|after 1\d|midnight/.test(q)) out.night = true;
  if (query.category) out.category = query.category;
  return out;
}

/** A plain keyword reader, used when Nano is missing or its line does not parse. */
export function ruleQuery(question: string, knownItems: string[]): Query {
  const q = question.toLowerCase();
  const feeWord = /\b(platform|delivery|packing|packaging|convenience|handling|service|small order|small cart|late night|surge|rain)\b/.exec(q)?.[1];
  if (/\bfees?\b|\bcharges?\b/.test(q)) {
    const query: Query = { metric: "fees" };
    if (feeWord) query.item = feeWord;
    const month = MONTHS.findIndex((m) => new RegExp(`\\b(${m}|${m.slice(0, 3)})\\b`).test(q));
    if (month >= 0) query.month = month + 1;
    return query;
  }
  const query: Query = {
    metric: /how much|spend|spent|cost/.test(q)
      ? "spend"
      : /biggest|most expensive|largest/.test(q)
        ? "biggest"
        : /how many times|how often/.test(q)
          ? "times"
          : "orders",
  };
  const month = MONTHS.findIndex((m) => new RegExp(`\\b(${m}|${m.slice(0, 3)})\\b`).test(q));
  if (month >= 0) query.month = month + 1;
  if (/night|after 10|late/.test(q)) query.night = true;
  const item = [...knownItems].sort((a, b) => b.length - a.length).find((k) => q.includes(k));
  if (item) query.item = item;
  else {
    // "biryani" in the question should match labels like "chicken biryani" too.
    const stop = new Set(["much", "many", "spend", "spent", "order", "orders", "what", "with", "from", "this", "year", "times", "money", "after", "night", "biggest"]);
    const word = q
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4 && !stop.has(w) && !MONTHS.some((m) => m.startsWith(w) || w.startsWith(m.slice(0, 3))))
      .find((w) => knownItems.some((k) => k.split(" ").includes(w)));
    if (word) query.item = word;
  }
  for (const [word, cat] of Object.entries({ food: "food_delivery", grocer: "groceries", snack: "snacks", electronic: "electronics", gadget: "electronics", cloth: "fashion", fashion: "fashion", book: "books", beauty: "beauty", travel: "travel" } as Record<string, Category>)) {
    if (!query.item && q.includes(word)) query.category = cat;
  }
  return query;
}

export interface Answer {
  /** The receipt line, e.g. "BIRYANI IN MARCH". */
  label: string;
  value: string;
  detail: string;
}

function isNight(hour?: number) {
  return hour !== undefined && (hour >= 22 || hour < 4);
}

export function answerQuery(query: Query, orders: Order[], labels: Map<string, ItemLabel>, year: number): Answer {
  const currency = orders[0]?.currency ?? "INR";
  const pool = orders.filter(
    (o) =>
      o.status === "delivered" &&
      o.date.startsWith(String(year)) &&
      (!query.month || Number(o.date.slice(5, 7)) === query.month) &&
      (!query.night || isNight(o.hour)) &&
      (!query.merchant || normalizeName(o.merchant).includes(normalizeName(query.merchant))),
  );
  const itemFilter = Boolean(query.item || query.category);
  const matchItem = (o: Order, name: string) => {
    const l = labels.get(normalizeName(name));
    const label = l?.label ?? normalizeName(name);
    const category = o.knownCategory ?? l?.category ?? "other";
    if (query.item && !(label.includes(query.item) || normalizeName(name).includes(query.item))) return false;
    if (query.category && category !== query.category) return false;
    return true;
  };

  if (query.metric === "fees") {
    const kind = query.item?.toLowerCase().split(" ")[0].slice(0, 4);
    let fees = 0;
    let withFees = 0;
    for (const o of pool) {
      const hit = (o.fees ?? []).filter((f) => !kind || f.label.includes(kind));
      if (hit.length === 0) continue;
      withFees += 1;
      fees += hit.reduce((n, f) => n + f.amount, 0);
    }
    const what = query.item ? `${query.item} fees` : "fees";
    const parts = [what];
    if (query.merchant) parts.push(`at ${query.merchant}`);
    if (query.month) parts.push(`in ${MONTHS[query.month - 1]}`);
    return {
      label: parts.join(" "),
      value: formatMoney(Math.round(fees), currency),
      detail: withFees ? `on ${withFees} order${withFees === 1 ? "" : "s"}, on top of what you bought` : "no fees found on these orders",
    };
  }

  let spend = 0;
  let times = 0;
  let matchedOrders = 0;
  let biggest: { total: number; date: string; what: string } | undefined;
  for (const o of pool) {
    const items = o.items.length ? o.items : [{ name: o.merchant, qty: 1 }];
    const hits = itemFilter ? items.filter((it) => matchItem(o, it.name)) : items;
    if (hits.length === 0) continue;
    matchedOrders += 1;
    // Stores give order totals, not item prices, so an order's total is shared across its items.
    spend += itemFilter ? (o.total * hits.length) / items.length : o.total;
    times += hits.reduce((n, it) => n + it.qty, 0);
    if (!biggest || o.total > biggest.total) biggest = { total: o.total, date: o.date, what: hits[0].name };
  }

  const subject = query.item ?? (query.category ? CATEGORY_NAMES[query.category] : "everything");
  const parts = [subject];
  if (query.merchant) parts.push(`from ${query.merchant}`);
  if (query.month) parts.push(`in ${MONTHS[query.month - 1]}`);
  if (query.night) parts.push("after 10pm");
  const label = parts.join(" ");
  const ordersText = `${matchedOrders} order${matchedOrders === 1 ? "" : "s"}`;

  switch (query.metric) {
    case "spend":
      return { label, value: formatMoney(Math.round(spend), currency), detail: `across ${ordersText}${itemFilter ? ", shared by item where an order had several" : ""}` };
    case "times":
      return { label, value: `${times}×`, detail: `across ${ordersText}` };
    case "biggest":
      return biggest
        ? { label, value: formatMoney(Math.round(biggest.total), currency), detail: `on ${biggest.date}: ${biggest.what}` }
        : { label, value: "none", detail: "no matching orders" };
    default:
      return { label, value: String(matchedOrders), detail: matchedOrders ? `${times} items in total` : "no matching orders" };
  }
}
