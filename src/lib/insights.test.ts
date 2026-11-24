import { describe, expect, it } from "vitest";
import { placeName, privateCards, privateInsights } from "./insights";
import { sampleOrders } from "./sample";
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

describe("private insights", () => {
  it("adds the same restaurant up across apps", () => {
    expect(placeName("Thalappakatti (Swiggy)")).toBe("Thalappakatti");
    const ins = privateInsights(
      [
        order({ merchant: "Thalappakatti (Swiggy)", knownCategory: "food_delivery" }),
        order({ merchant: "Thalappakatti (Zomato)", knownCategory: "food_delivery" }),
        order({ merchant: "Amazon" }),
      ],
      new Map(),
      2026,
    );
    expect(ins.regulars[0]).toEqual({ name: "Thalappakatti", orders: 2 });
    expect(ins.regulars.find((r) => r.name === "Amazon")).toBeUndefined();
  });

  it("finds the longest run of consecutive days and the priciest day", () => {
    const ins = privateInsights(
      [
        order({ date: "2026-03-01", total: 50 }),
        order({ date: "2026-03-02", total: 50 }),
        order({ date: "2026-03-03", total: 900 }),
        order({ date: "2026-03-03", total: 100 }),
        order({ date: "2026-03-10", total: 50 }),
      ],
      new Map(),
      2026,
    );
    expect(ins.longestStreak).toEqual({ days: 3, from: "2026-03-01", to: "2026-03-03" });
    expect(ins.priciestDay).toEqual({ date: "2026-03-03", spend: 1000, orders: 2 });
  });

  it("counts repeat shop buys by label, not by raw name", () => {
    const labels = new Map<string, ItemLabel>([
      ["ncert maths textbook class 10", { label: "textbook", category: "books", source: "on_device" }],
      ["rd sharma class 10", { label: "textbook", category: "books", source: "on_device" }],
    ]);
    const ins = privateInsights(
      [order({ items: [{ name: "NCERT Maths Textbook Class 10", qty: 1 }] }), order({ items: [{ name: "RD Sharma Class 10", qty: 1 }] })],
      labels,
      2026,
    );
    expect(ins.repeatBuys).toEqual([{ label: "textbook", times: 2 }]);
  });

  it("makes several cards for a full sample year", () => {
    const cards = privateCards(privateInsights(sampleOrders("chennai", 2026), new Map(), 2026), "INR");
    expect(cards.map((c) => c.kicker)).toContain("Your regulars");
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });
});
