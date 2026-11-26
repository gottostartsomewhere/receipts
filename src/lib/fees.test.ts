import { describe, expect, it } from "vitest";
import { feeReport } from "./fees";
import type { Order } from "./types";

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

describe("fees receipt", () => {
  const orders = [
    order({ merchant: "Thalappakatti (Swiggy)", total: 400, fees: [{ label: "platform fee", amount: 14.99 }, { label: "packing charges", amount: 30 }] }),
    order({ merchant: "A2B (Swiggy)", total: 300, fees: [{ label: "platform fee", amount: 14.99 }] }),
    order({ merchant: "BookMyShow", total: 572.2, fees: [{ label: "convenience fee", amount: 80.24 }] }),
    order({ merchant: "Amazon", total: 900 }),
    order({ merchant: "Thalappakatti (Swiggy)", total: 500, status: "cancelled", fees: [{ label: "platform fee", amount: 14.99 }] }),
  ];
  const r = feeReport(orders, 2026);

  it("adds up fees on delivered orders only", () => {
    expect(r.total).toBe(140.22);
    expect(r.ordersWithFees).toBe(3);
    expect(r.share).toBeCloseTo(140.22 / 2172.2, 4);
  });

  it("groups by app and by kind of fee, biggest first", () => {
    expect(r.byShop).toEqual([
      { shop: "BookMyShow", amount: 80.24 },
      { shop: "Swiggy", amount: 59.98 },
    ]);
    expect(r.lines[0]).toEqual({ shop: "BookMyShow", label: "convenience fee", times: 1, amount: 80.24 });
    expect(r.lines.find((l) => l.label === "platform fee")).toEqual({ shop: "Swiggy", label: "platform fee", times: 2, amount: 29.98 });
    expect(r.largest).toMatchObject({ shop: "BookMyShow", amount: 80.24 });
  });

  it("is empty when no shop showed fees", () => {
    expect(feeReport([order({})], 2026).total).toBe(0);
  });
});
