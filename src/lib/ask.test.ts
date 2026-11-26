import { describe, expect, it } from "vitest";
import { answerQuery, groundQuery, parseQueryLine, ruleQuery } from "./ask";
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

const labels = new Map<string, ItemLabel>([
  ["chicken biryani (full)", { label: "biryani", category: "food_delivery", source: "on_device" }],
  ["butter naan", { label: "naan", category: "food_delivery", source: "on_device" }],
  ["wireless mouse", { label: "wireless mouse", category: "electronics", source: "on_device" }],
]);

const orders: Order[] = [
  order({ merchant: "Thalappakatti (Swiggy)", date: "2026-03-02", hour: 23, total: 400, knownCategory: "food_delivery", items: [{ name: "Chicken Biryani (Full)", qty: 2 }] }),
  order({ merchant: "Thalappakatti (Swiggy)", date: "2026-03-20", hour: 13, total: 600, knownCategory: "food_delivery", items: [{ name: "Chicken Biryani (Full)", qty: 1 }, { name: "Butter Naan", qty: 2 }] }),
  order({ merchant: "Amazon", date: "2026-04-05", total: 900, items: [{ name: "Wireless Mouse", qty: 1 }] }),
  order({ merchant: "Amazon", date: "2026-03-05", total: 5000, status: "cancelled", items: [{ name: "Wireless Mouse", qty: 1 }] }),
];

describe("Nano's query line", () => {
  it("parses a full line and ignores dashes", () => {
    expect(parseQueryLine("spend|biryani|-|-|3|-")).toEqual({ metric: "spend", item: "biryani", month: 3 });
    expect(parseQueryLine("orders|-|food|thalappakatti|-|night")).toEqual({ metric: "orders", category: "food_delivery", merchant: "thalappakatti", night: true });
  });
  it("rejects lines that are not queries", () => {
    expect(parseQueryLine("I think you spent a lot")).toBeNull();
    expect(parseQueryLine("total|biryani|-|-|3|-")).toBeNull();
  });
});

describe("grounding Nano's query in the question", () => {
  it("drops a month and shop the question never mentioned", () => {
    const slip = { metric: "orders" as const, merchant: "after 10pm", month: 10, night: true };
    expect(groundQuery(slip, "How many orders after 10pm?")).toEqual({ metric: "orders", night: true });
  });
  it("keeps what the question really says", () => {
    const q = { metric: "spend" as const, item: "dosa", merchant: "a2b", month: 6 };
    expect(groundQuery(q, "what did I spend on dosa from A2B in June?")).toEqual(q);
  });
});

describe("fees", () => {
  const withFees: Order[] = [
    order({ merchant: "Thalappakatti (Swiggy)", date: "2026-03-02", total: 400, knownCategory: "food_delivery", fees: [{ label: "platform fee", amount: 14.99 }, { label: "packing charges", amount: 30 }] }),
    order({ merchant: "A2B (Swiggy)", date: "2026-04-10", total: 300, knownCategory: "food_delivery", fees: [{ label: "platform fee", amount: 14.99 }] }),
    order({ merchant: "Amazon", date: "2026-04-11", total: 900 }),
  ];
  it("adds up fees, all of them or one kind", () => {
    expect(answerQuery({ metric: "fees" }, withFees, labels, 2026)).toMatchObject({ value: "₹60" });
    expect(answerQuery({ metric: "fees", item: "platform fee" }, withFees, labels, 2026)).toMatchObject({ value: "₹30" });
    expect(answerQuery({ metric: "fees", month: 4 }, withFees, labels, 2026).value).toBe("₹15");
  });
  it("reads fee questions without a model", () => {
    expect(ruleQuery("How much did I pay in platform fees?", [])).toEqual({ metric: "fees", item: "platform" });
    expect(parseQueryLine("fees|platform fee|-|-|-|-")).toEqual({ metric: "fees", item: "platform fee" });
  });
});

describe("local rules fallback", () => {
  it("understands simple questions without a model", () => {
    expect(ruleQuery("How much did I spend on biryani in March?", ["biryani", "naan"])).toEqual({ metric: "spend", item: "biryani", month: 3 });
    expect(ruleQuery("how many orders after 10pm", [])).toMatchObject({ metric: "orders", night: true });
    expect(ruleQuery("How much did I spend on biryani?", ["chicken biryani", "mutton chukka"])).toEqual({ metric: "spend", item: "biryani" });
    expect(ruleQuery("How much did I spend in March?", ["chicken biryani"])).toEqual({ metric: "spend", month: 3 });
  });
});

describe("answers are counted locally", () => {
  it("shares an order's total across its items when filtering by item", () => {
    const a = answerQuery({ metric: "spend", item: "biryani", month: 3 }, orders, labels, 2026);
    // 400 (all biryani) + 600 split over 2 items -> 300
    expect(a.value).toBe("₹700");
    expect(a.detail).toContain("2 orders");
  });
  it("counts times and ignores cancelled orders", () => {
    expect(answerQuery({ metric: "times", item: "biryani" }, orders, labels, 2026).value).toBe("3×");
    expect(answerQuery({ metric: "spend", category: "electronics" }, orders, labels, 2026).value).toBe("₹900");
  });
  it("handles late night and merchants", () => {
    expect(answerQuery({ metric: "orders", night: true }, orders, labels, 2026).value).toBe("1");
    expect(answerQuery({ metric: "orders", merchant: "thalappakatti" }, orders, labels, 2026).value).toBe("2");
  });
});
