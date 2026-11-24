import { describe, expect, it } from "vitest";
import { chunkText, detectCurrency, groundOrder, parseOrderLine } from "./anypage";
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
