import { CATEGORY_NAMES, type Category, type Currency, type ItemLabel, type Order } from "./types";

export interface YearSummary {
  year: number;
  currency: Currency;
  orderCount: number;
  itemCount: number;
  totalSpend: number;
  byCategory: { category: Category; spend: number; orders: number }[];
  topLabels: { label: string; count: number }[];
  /** Share of orders placed 22:00-03:59, among orders whose store reports the hour. */
  lateNightShare?: number;
  lateNightOrders: number;
  busiestMonth: { month: string; orders: number; spend: number };
  biggestOrder: { total: number; label: string };
  cancelled: number;
  storesUsed: number;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function isLateNight(hour: number): boolean {
  return hour >= 22 || hour < 4;
}

/** Everything is computed here, on the laptop. Nothing in this file talks to the network. */
export function summarize(orders: Order[], labels: Map<string, ItemLabel>, year: number): YearSummary {
  const inYear = orders.filter((o) => o.date.startsWith(String(year)));
  const delivered = inYear.filter((o) => o.status === "delivered");
  const currency: Currency = delivered[0]?.currency ?? inYear[0]?.currency ?? "INR";

  const catSpend = new Map<Category, { spend: number; orders: Set<string> }>();
  const labelCount = new Map<string, number>();
  const monthStats = new Map<number, { orders: number; spend: number }>();
  let totalSpend = 0;
  let itemCount = 0;
  let lateNightOrders = 0;
  let withHour = 0;
  let biggest: { total: number; label: string } = { total: 0, label: "" };

  for (const order of delivered) {
    totalSpend += order.total;
    const month = Number(order.date.slice(5, 7)) - 1;
    const m = monthStats.get(month) ?? { orders: 0, spend: 0 };
    m.orders += 1;
    m.spend += order.total;
    monthStats.set(month, m);

    if (order.hour !== undefined) {
      withHour += 1;
      if (isLateNight(order.hour)) lateNightOrders += 1;
    }

    const items = order.items.length > 0 ? order.items : [{ name: order.merchant, qty: 1 }];
    const share = order.total / items.length;
    let orderTopLabel = "";
    for (const item of items) {
      itemCount += item.qty;
      const l = labels.get(normalizeName(item.name));
      const category: Category = order.knownCategory ?? l?.category ?? "other";
      const label = l?.label ?? normalizeName(item.name).split(" ").slice(0, 3).join(" ");
      if (!orderTopLabel) orderTopLabel = label;
      labelCount.set(label, (labelCount.get(label) ?? 0) + item.qty);
      const c = catSpend.get(category) ?? { spend: 0, orders: new Set<string>() };
      c.spend += share;
      c.orders.add(order.id);
      catSpend.set(category, c);
    }
    if (order.total > biggest.total) biggest = { total: order.total, label: orderTopLabel };
  }

  const byCategory = [...catSpend.entries()]
    .map(([category, v]) => ({ category, spend: Math.round(v.spend), orders: v.orders.size }))
    .sort((a, b) => b.spend - a.spend);

  const topLabels = [...labelCount.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5);

  let busiestMonth = { month: MONTHS[0], orders: 0, spend: 0 };
  for (const [month, v] of monthStats) {
    if (v.orders > busiestMonth.orders) busiestMonth = { month: MONTHS[month], orders: v.orders, spend: Math.round(v.spend) };
  }

  return {
    year,
    currency,
    orderCount: delivered.length,
    itemCount,
    totalSpend: Math.round(totalSpend),
    byCategory,
    topLabels,
    lateNightShare: withHour > 0 ? lateNightOrders / withHour : undefined,
    lateNightOrders,
    busiestMonth,
    biggestOrder: { total: Math.round(biggest.total), label: biggest.label },
    cancelled: inYear.filter((o) => o.status === "cancelled" || o.status === "refunded").length,
    storesUsed: new Set(delivered.map((o) => o.store)).size,
  };
}

/**
 * The complete list of facts that may leave the laptop. The person sees exactly this
 * object before anything is sent. Money is rounded so the cloud never sees exact totals.
 */
export interface CloudPayload {
  year: number;
  currency: Currency;
  total_spend_rounded: number;
  orders: number;
  top_category: string;
  top_category_percent: number;
  favourite_item: string;
  favourite_item_count: number;
  busiest_month: string;
  biggest_order_rounded: number;
  biggest_order_item: string;
  late_night_percent?: number;
}

function roundMoney(amount: number, currency: Currency): number {
  const step = currency === "INR" ? 100 : 10;
  return Math.round(amount / step) * step;
}

export function toCloudPayload(s: YearSummary): CloudPayload {
  const top = s.byCategory[0];
  const fav = s.topLabels[0];
  const payload: CloudPayload = {
    year: s.year,
    currency: s.currency,
    total_spend_rounded: roundMoney(s.totalSpend, s.currency),
    orders: s.orderCount,
    top_category: top ? CATEGORY_NAMES[top.category].toLowerCase() : "nothing",
    top_category_percent: top && s.totalSpend > 0 ? Math.round((top.spend / s.totalSpend) * 100) : 0,
    favourite_item: fav?.label ?? "nothing",
    favourite_item_count: fav?.count ?? 0,
    busiest_month: s.busiestMonth.month,
    biggest_order_rounded: roundMoney(s.biggestOrder.total, s.currency),
    biggest_order_item: s.biggestOrder.label || "something",
  };
  if (s.lateNightShare !== undefined) payload.late_night_percent = Math.round(s.lateNightShare * 100);
  return payload;
}

export function countFacts(payload: CloudPayload): number {
  return Object.values(payload).filter((v) => v !== undefined).length;
}

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
