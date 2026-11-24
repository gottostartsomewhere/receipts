// Private insights: worked out on the laptop and drawn on the laptop. These cards can name
// real restaurants and dates because none of this is ever sent anywhere.

import type { CardSpec } from "./cards";
import { formatMoney, normalizeName } from "./summary";
import type { Currency, ItemLabel, Order } from "./types";

export interface PrivateInsights {
  regulars: { name: string; orders: number }[];
  priciestDay?: { date: string; spend: number; orders: number };
  longestStreak?: { days: number; from: string; to: string };
  repeatBuys: { label: string; times: number }[];
  lateNightFavourite?: { label: string; times: number };
}

/** "Hotel Junior Kuppanna (Swiggy)" -> "Hotel Junior Kuppanna", so the same place adds up across apps. */
export function placeName(merchant: string): string {
  return merchant.replace(/\s*\((Swiggy|Zomato|DoorDash|Uber Eats|Instamart|Instacart|Blinkit)\)\s*$/i, "").trim();
}

const DAY_MS = 86_400_000;

export function privateInsights(orders: Order[], labels: Map<string, ItemLabel>, year: number): PrivateInsights {
  const delivered = orders.filter((o) => o.status === "delivered" && o.date.startsWith(String(year)));

  const byPlace = new Map<string, number>();
  for (const o of delivered) {
    // Regulars are places you order food from; "Amazon" or "Flipkart" as a regular says nothing.
    if (o.knownCategory !== "food_delivery") continue;
    const name = placeName(o.merchant);
    byPlace.set(name, (byPlace.get(name) ?? 0) + 1);
  }
  const regulars = [...byPlace.entries()]
    .map(([name, n]) => ({ name, orders: n }))
    .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name))
    .slice(0, 3);

  const byDay = new Map<string, { spend: number; orders: number }>();
  for (const o of delivered) {
    const d = byDay.get(o.date) ?? { spend: 0, orders: 0 };
    d.spend += o.total;
    d.orders += 1;
    byDay.set(o.date, d);
  }
  let priciestDay: PrivateInsights["priciestDay"];
  for (const [date, d] of byDay) if (!priciestDay || d.spend > priciestDay.spend) priciestDay = { date, spend: Math.round(d.spend), orders: d.orders };

  const days = [...byDay.keys()].sort();
  let longestStreak: PrivateInsights["longestStreak"];
  let runStart = 0;
  for (let i = 1; i <= days.length; i++) {
    const broken = i === days.length || Date.parse(days[i]) - Date.parse(days[i - 1]) !== DAY_MS;
    if (broken) {
      const len = i - runStart;
      if (!longestStreak || len > longestStreak.days) longestStreak = { days: len, from: days[runStart], to: days[i - 1] };
      runStart = i;
    }
  }

  const shopBuys = new Map<string, number>();
  const nightFood = new Map<string, number>();
  for (const o of delivered) {
    const seen = new Set<string>();
    for (const it of o.items) {
      const l = labels.get(normalizeName(it.name));
      const label = l?.label ?? normalizeName(it.name);
      const category = o.knownCategory ?? l?.category ?? "other";
      if (category !== "food_delivery" && !seen.has(label)) {
        seen.add(label);
        shopBuys.set(label, (shopBuys.get(label) ?? 0) + 1);
      }
      if (o.hour !== undefined && (o.hour >= 22 || o.hour < 4)) nightFood.set(label, (nightFood.get(label) ?? 0) + it.qty);
    }
  }
  const repeatBuys = [...shopBuys.entries()]
    .filter(([, n]) => n >= 2)
    .map(([label, times]) => ({ label, times }))
    .sort((a, b) => b.times - a.times)
    .slice(0, 3);
  const night = [...nightFood.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    regulars,
    priciestDay,
    longestStreak: longestStreak && longestStreak.days >= 3 ? longestStreak : undefined,
    repeatBuys,
    lateNightFavourite: night && night[1] >= 3 ? { label: night[0], times: night[1] } : undefined,
  };
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Cards built only from private insights. Text is written here, on the laptop, not by the cloud. */
export function privateCards(ins: PrivateInsights, currency: Currency): CardSpec[] {
  const cards: CardSpec[] = [];
  const [first, ...rest] = ins.regulars;
  if (first && first.orders >= 3) {
    cards.push({
      kicker: "Your regulars",
      headline: first.name,
      line:
        `${first.orders} orders.` +
        (rest.length ? ` Then ${rest.map((r) => `${r.name} (${r.orders})`).join(" and ")}.` : ""),
    });
  }
  if (ins.lateNightFavourite) {
    cards.push({
      kicker: "After 10pm",
      headline: `${ins.lateNightFavourite.label} ×${ins.lateNightFavourite.times}`,
      line: "Your most ordered thing after 10pm.",
    });
  }
  if (ins.priciestDay && ins.priciestDay.orders >= 1) {
    cards.push({
      kicker: "Priciest day",
      headline: shortDate(ins.priciestDay.date),
      line: `${formatMoney(ins.priciestDay.spend, currency)} across ${ins.priciestDay.orders} order${ins.priciestDay.orders === 1 ? "" : "s"} in one day.`,
    });
  }
  if (ins.longestStreak) {
    cards.push({
      kicker: "Longest streak",
      headline: `${ins.longestStreak.days} days`,
      line: `Something arrived every day from ${shortDate(ins.longestStreak.from)} to ${shortDate(ins.longestStreak.to)}.`,
    });
  }
  if (ins.repeatBuys.length) {
    const [top, ...more] = ins.repeatBuys;
    cards.push({
      kicker: "Bought again",
      headline: `${top.label} ×${top.times}`,
      line: more.length ? `Also on repeat: ${more.map((m) => `${m.label} ×${m.times}`).join(", ")}.` : "Once was not enough.",
    });
  }
  return cards;
}
