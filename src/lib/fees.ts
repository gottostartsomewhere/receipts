// The fees receipt: every charge on top of what was bought, by app and by kind. Worked out on
// the laptop from the orders; only the rounded total and share ever go to the cloud.

import { shopOf } from "./summary";
import type { Order } from "./types";

export interface FeeLine {
  shop: string;
  label: string;
  times: number;
  amount: number;
}

export interface FeeReport {
  total: number;
  spend: number;
  share: number;
  ordersWithFees: number;
  lines: FeeLine[];
  byShop: { shop: string; amount: number }[];
  /** Fees per calendar month, January first. */
  byMonth: number[];
  largest?: { shop: string; label: string; amount: number; date: string };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function feeReport(orders: Order[], year: number): FeeReport {
  const delivered = orders.filter((o) => o.status === "delivered" && o.date.startsWith(String(year)));
  const lines = new Map<string, FeeLine>();
  const shops = new Map<string, number>();
  let total = 0;
  let spend = 0;
  let ordersWithFees = 0;
  let largest: FeeReport["largest"];
  const byMonth = Array.from({ length: 12 }, () => 0);
  for (const o of delivered) {
    spend += o.total;
    const fees = (o.fees ?? []).filter((f) => f.amount > 0);
    if (fees.length) ordersWithFees += 1;
    const shop = shopOf(o.merchant);
    const month = Number(o.date.slice(5, 7)) - 1;
    for (const f of fees) {
      total += f.amount;
      if (month >= 0 && month < 12) byMonth[month] += f.amount;
      shops.set(shop, (shops.get(shop) ?? 0) + f.amount);
      const key = `${shop}|${f.label}`;
      const line = lines.get(key) ?? { shop, label: f.label, times: 0, amount: 0 };
      line.times += 1;
      line.amount += f.amount;
      lines.set(key, line);
      if (!largest || f.amount > largest.amount) largest = { shop, label: f.label, amount: f.amount, date: o.date };
    }
  }
  return {
    total: round2(total),
    spend: round2(spend),
    share: spend > 0 ? total / spend : 0,
    ordersWithFees,
    lines: [...lines.values()].map((l) => ({ ...l, amount: round2(l.amount) })).sort((a, b) => b.amount - a.amount),
    byShop: [...shops.entries()].map(([shop, amount]) => ({ shop, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    byMonth: byMonth.map(round2),
    largest,
  };
}
