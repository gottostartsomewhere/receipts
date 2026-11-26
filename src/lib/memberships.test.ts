import { describe, expect, it } from "vitest";
import { feeReport } from "./fees";
import { breakEvens } from "./memberships";
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

describe("membership break-even", () => {
  const report = feeReport(
    [
      order({ merchant: "A (Swiggy)", date: "2026-02-01", fees: [{ label: "delivery fee", amount: 40 }, { label: "platform fee", amount: 14.99 }] }),
      order({ merchant: "B (Swiggy)", date: "2026-06-01", fees: [{ label: "delivery fee", amount: 30 }, { label: "surge fee", amount: 20 }] }),
      order({ merchant: "C (Zomato)", date: "2026-07-01", fees: [{ label: "platform fee", amount: 12.5 }] }),
    ],
    2026,
  );

  it("counts only the fees a membership waives, and scales to a full year", () => {
    const [swiggy] = breakEvens(report, 6);
    expect(swiggy).toEqual({ shop: "Swiggy", name: "Swiggy One", paid: 90, perYear: 180, times: 3 });
  });

  it("leaves out apps with nothing a membership would waive", () => {
    expect(breakEvens(report, 6).map((b) => b.shop)).not.toContain("Zomato");
  });

  it("tracks fees by month", () => {
    expect(report.byMonth[1]).toBeCloseTo(54.99);
    expect(report.byMonth[5]).toBe(50);
  });
});
