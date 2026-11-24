import { describe, expect, it } from "vitest";
import { assignFees, chunkText, detectCurrency, groundFees, groundOrder, groundYear, parseOrderLine } from "./anypage";
import { looksLikeOrders } from "./pages";
import type { Order } from "../types";

const page = `My Orders
Boat Airdopes 141 Bluetooth Earbuds
Delivered on Mar 14
₹1,299
Puma Men's Running Shoes Black
Delivered on Apr 02
₹2,499
Ship to: Kevin, Chennai`;

describe("reading any order page", () => {
  it("parses Nano's order lines", () => {
    expect(parseOrderLine("2026-03-14|1299|delivered|-|Flipkart|Boat Airdopes 141; Charging cable")).toEqual({
      date: "2026-03-14",
      total: 1299,
      status: "delivered",
      fees: [],
      merchant: "Flipkart",
      items: ["Boat Airdopes 141", "Charging cable"],
    });
    expect(parseOrderLine("2026-05-18|1799|cancelled|-||Redmi Power Bank")?.status).toBe("cancelled");
    expect(parseOrderLine("2026-05-18|1799|returned|-||Redmi Power Bank")?.status).toBe("refunded");
    expect(parseOrderLine("2026-13-01|1299|delivered|-|x|y")).toBeNull();
    expect(parseOrderLine("2026-03-14|free|delivered|-|x|y")).toBeNull();
  });

  it("parses fees and keeps only the ones printed on the page", () => {
    const line = parseOrderLine("2026-10-30|24.17|delivered|delivery fee 2.99; service fee 1.75; rain fee 9|Halfway Market|Pad Thai");
    expect(line?.fees).toEqual([
      { label: "delivery fee", amount: 2.99 },
      { label: "service fee", amount: 1.75 },
      { label: "rain fee", amount: 9 },
    ]);
    const shop = "Pad Thai, large\nDelivery fee $2.99\nService fee $1.75\nTotal $24.17";
    expect(groundFees(line!.fees, shop)).toEqual([
      { label: "delivery fee", amount: 2.99 },
      { label: "service fee", amount: 1.75 },
    ]);
    expect(groundFees([{ label: "packaging charges", amount: 30 }], "Packaging charges ₹30")).toEqual([{ label: "packing charges", amount: 30 }]);
    expect(groundFees([{ label: "convenience fees", amount: 80.24 }], "Convenience fees ₹80.24")).toEqual([{ label: "convenience fee", amount: 80.24 }]);
  });

  it("only gives a fee to the order whose part of the page prints it", () => {
    const shop = [
      "Order placed November 14, 2026", "Total $86.40", "Hydro Flask Bottle",
      "Order placed October 30, 2026", "Total $24.17", "Pad Thai, large", "Delivery fee $2.99", "Service fee $3.18",
      "Order placed March 27, 2026", "Total $21.06", "Pad Thai, large", "Delivery fee $0.99", "Service fee $2.57",
    ].join("\n");
    const make = (total: number, name: string): Order => ({
      id: name + total, store: "web", merchant: "Halfway Market", date: "2026-01-01", total, currency: "USD", status: "delivered",
      items: [{ name, qty: 1 }], fees: [],
    });
    const bottle = make(86.4, "Hydro Flask Bottle");
    const oct = make(24.17, "Pad Thai, large");
    const mar = make(21.06, "Pad Thai, large");
    assignFees(
      [
        { order: bottle, fees: [{ label: "delivery fee", amount: 2.99 }] }, // Nano copied a fee onto the bottle
        { order: oct, fees: [{ label: "delivery fee", amount: 2.99 }, { label: "service fee", amount: 3.18 }] },
        { order: mar, fees: [{ label: "delivery fee", amount: 0.99 }, { label: "service fee", amount: 2.57 }] },
      ],
      shop,
    );
    expect(bottle.fees).toEqual([]);
    expect(oct.fees!.map((f) => f.amount)).toEqual([2.99, 3.18]);
    expect(mar.fees!.map((f) => f.amount)).toEqual([0.99, 2.57]);
  });

  const base = { status: "delivered" as const, merchant: "", fees: [] };

  it("keeps orders whose total and items are really on the page", () => {
    const ok = groundOrder({ ...base, date: "2026-03-14", total: 1299, items: ["Boat Airdopes 141"] }, page);
    expect(ok?.items).toEqual(["Boat Airdopes 141"]);
  });

  it("drops invented orders and invented items", () => {
    expect(groundOrder({ ...base, date: "2026-03-14", total: 4599, items: ["Boat Airdopes 141"] }, page)).toBeNull();
    expect(groundOrder({ ...base, date: "2026-03-14", total: 1299, items: ["Sony Headphones"] }, page)).toBeNull();
    const partly = groundOrder({ ...base, date: "2026-04-02", total: 2499, items: ["Puma Running Shoes", "Gold Watch"] }, page);
    expect(partly?.items).toEqual(["Puma Running Shoes"]);
  });

  it("keeps an older year only when the page prints that full date", () => {
    const flipkart = "ORDER TIME\nLast 30 days\n2024\n2023\n₹392\nDelivered on Feb 16\nYour item has been delivered";
    expect(groundYear("2024-02-16", flipkart, 2026)).toBe("2026-02-16");
    expect(groundYear("2025-12-30", "Delivered on Dec 30, 2025", 2026)).toBe("2025-12-30");
    expect(groundYear("2025-12-30", "Delivered 30 December 2025", 2026)).toBe("2025-12-30");
    expect(groundYear("2026-03-01", "Delivered on Mar 1", 2026)).toBe("2026-03-01");
  });

  it("rejects a date that is nowhere on the page", () => {
    expect(groundYear("2026-03-01", "Watch any movie @ Rs 89", 2026)).toBeNull();
  });

  it("uses a year the page prints, even when the model assumed this year", () => {
    const blinkit = "Arrived in 6 minutes\n₹1,103\n08 Oct, 4:02 pm\nArrived in 9 minutes\n₹147\n19 Apr 2025, 7:10 pm";
    expect(groundYear("2026-04-19", blinkit, 2026)).toBe("2025-04-19");
    expect(groundYear("2026-10-08", blinkit, 2026)).toBe("2026-10-08");
    expect(groundYear("2026-03-05", "Ordered 2025-03-05", 2026)).toBe("2025-03-05");
  });

  it("chunks long pages at line breaks", () => {
    const long = Array.from({ length: 300 }, (_, i) => `Order line number ${i} with some words`).join("\n");
    const chunks = chunkText(long, 1000);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
    expect(chunks.join("\n")).toBe(long);
  });

  it("works out the currency and spots order pages", () => {
    expect(detectCurrency(page)).toBe("INR");
    expect(detectCurrency("Order total $45.10 Subtotal $40.00")).toBe("USD");
    expect(looksLikeOrders(page, "https://www.flipkart.com/account/orders")).toBe(true);
    expect(looksLikeOrders("Breaking news about the weather", "https://news.example.com/today")).toBe(false);
  });
});
