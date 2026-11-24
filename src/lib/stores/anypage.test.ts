import { describe, expect, it } from "vitest";
import { chunkText, detectCurrency, groundOrder, groundYear, parseOrderLine } from "./anypage";
import { looksLikeOrders } from "./pages";

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
    expect(parseOrderLine("2026-03-14|1299|delivered|Flipkart|Boat Airdopes 141; Charging cable")).toEqual({
      date: "2026-03-14",
      total: 1299,
      status: "delivered",
      merchant: "Flipkart",
      items: ["Boat Airdopes 141", "Charging cable"],
    });
    expect(parseOrderLine("2026-05-18|1799|cancelled||Redmi Power Bank")?.status).toBe("cancelled");
    expect(parseOrderLine("2026-05-18|1799|returned||Redmi Power Bank")?.status).toBe("refunded");
    expect(parseOrderLine("2026-13-01|1299|delivered|x|y")).toBeNull();
    expect(parseOrderLine("2026-03-14|free|delivered|x|y")).toBeNull();
  });

  const base = { status: "delivered" as const, merchant: "" };

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
