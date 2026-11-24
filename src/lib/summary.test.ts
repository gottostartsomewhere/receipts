import { describe, expect, it } from "vitest";
import { sampleOrders } from "./sample";
import { countFacts, normalizeName, summarize, toCloudPayload } from "./summary";
import type { ItemLabel, Order } from "./types";

const order = (o: Partial<Order>): Order => ({
  id: Math.random().toString(36),
  store: "sample",
  merchant: "Shop",
  date: "2026-03-14",
  total: 100,
  currency: "INR",
  status: "delivered",
  items: [{ name: "Thing", qty: 1 }],
  ...o,
});

describe("summarize", () => {
  it("only counts delivered orders in the requested year", () => {
    const orders = [
      order({ total: 500 }),
      order({ total: 300, status: "cancelled" }),
      order({ total: 900, date: "2025-12-31" }),
    ];
    const s = summarize(orders, new Map(), 2026);
    expect(s.orderCount).toBe(1);
    expect(s.totalSpend).toBe(500);
    expect(s.cancelled).toBe(1);
  });

  it("uses labels to find the favourite item and splits spend across categories", () => {
    const labels = new Map<string, ItemLabel>([
      [normalizeName("Chicken Biryani (Full)"), { label: "biryani", category: "food_delivery", source: "on_device" }],
      [normalizeName("Wireless Mouse"), { label: "wireless mouse", category: "electronics", source: "on_device" }],
    ]);
    const orders = [
      order({ total: 400, items: [{ name: "Chicken Biryani (Full)", qty: 2 }], knownCategory: "food_delivery", hour: 23 }),
      order({ total: 300, items: [{ name: "chicken biryani (full)", qty: 1 }], knownCategory: "food_delivery", hour: 13 }),
      order({ total: 1000, items: [{ name: "Wireless Mouse", qty: 1 }] }),
    ];
    const s = summarize(orders, labels, 2026);
    expect(s.topLabels[0]).toEqual({ label: "biryani", count: 3 });
    expect(s.byCategory[0]).toMatchObject({ category: "electronics", spend: 1000 });
    expect(s.lateNightShare).toBeCloseTo(0.5);
    expect(s.biggestOrder).toEqual({ total: 1000, label: "wireless mouse" });
  });
});

describe("toCloudPayload (the privacy boundary)", () => {
  const orders = sampleOrders("chennai", 2026);
  const s = summarize(orders, new Map(), 2026);
  const payload = toCloudPayload(s);
  const json = JSON.stringify(payload);

  it("rounds money so exact amounts never leave", () => {
    expect(payload.total_spend_rounded % 100).toBe(0);
    expect(payload.biggest_order_rounded % 100).toBe(0);
  });

  it("contains no dates, order ids, merchants or raw item names", () => {
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    for (const o of orders.slice(0, 50)) {
      expect(json).not.toContain(o.id);
      expect(json).not.toContain(o.merchant);
      for (const it of o.items) expect(json).not.toContain(it.name);
    }
  });

  it("is a short, fixed list of facts", () => {
    expect(Object.keys(payload).sort()).toEqual(
      [
        "biggest_order_item",
        "biggest_order_rounded",
        "busiest_month",
        "currency",
        "favourite_item",
        "favourite_item_count",
        "fee_share_percent",
        "fees_rounded",
        "late_night_percent",
        "orders",
        "top_category",
        "top_category_percent",
        "total_spend_rounded",
        "year",
      ].sort(),
    );
    expect(countFacts(payload)).toBe(14);
  });

  it("sends fees only as a rounded total and a share, never per order or per shop", () => {
    expect(payload.fees_rounded! % 10).toBe(0);
    expect(json).not.toMatch(/platform fee|packing|Swiggy|Zomato/i);
    const noFees = toCloudPayload(summarize(orders.map((o) => ({ ...o, fees: undefined })), new Map(), 2026));
    expect(noFees.fees_rounded).toBeUndefined();
    expect(countFacts(noFees)).toBe(12);
  });

  it("uses dollar rounding for USD", () => {
    const us = toCloudPayload(summarize(sampleOrders("seattle", 2026), new Map(), 2026));
    expect(us.currency).toBe("USD");
    expect(us.total_spend_rounded % 10).toBe(0);
  });
});
