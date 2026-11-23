import { describe, expect, it } from "vitest";
import { parseDishString, parseLooseDate, parseMoney, parseSqlTime, parseZomatoTime, statusFrom } from "./parse";

describe("store parsing", () => {
  it("reads Amazon.in and Amazon.com order dates", () => {
    expect(parseLooseDate("12 October 2026")).toBe("2026-10-12");
    expect(parseLooseDate("October 12, 2026")).toBe("2026-10-12");
    expect(parseLooseDate("3 Sept 2026")).toBe("2026-09-03");
    expect(parseLooseDate("nonsense")).toBeNull();
  });

  it("reads money in rupees and dollars", () => {
    expect(parseMoney("₹1,299.00")).toBe(1299);
    expect(parseMoney("$12.34")).toBe(12.34);
    expect(parseMoney("Rs. 450")).toBe(450);
    expect(parseMoney(399)).toBe(399);
    expect(parseMoney(undefined)).toBe(0);
  });

  it("reads Swiggy and Zomato times with the hour", () => {
    expect(parseSqlTime("2026-03-14 21:45:10")).toEqual({ date: "2026-03-14", hour: 21 });
    expect(parseZomatoTime("March 14, 2026 at 09:45 PM")).toEqual({ date: "2026-03-14", hour: 21 });
    expect(parseZomatoTime("March 14, 2026 at 12:10 AM")).toEqual({ date: "2026-03-14", hour: 0 });
  });

  it("splits Zomato dish strings", () => {
    expect(parseDishString("1 x Chicken Biryani, 2 x Butter Naan")).toEqual([
      { name: "Chicken Biryani", qty: 1 },
      { name: "Butter Naan", qty: 2 },
    ]);
    expect(parseDishString("Idli (4 pcs, with podi)")).toEqual([{ name: "Idli (4 pcs, with podi)", qty: 1 }]);
  });

  it("spots cancelled and refunded orders but not return windows", () => {
    expect(statusFrom("Cancelled")).toBe("cancelled");
    expect(statusFrom("Refund issued")).toBe("refunded");
    expect(statusFrom("Delivered 12 November Return window closed on 19 November")).toBe("delivered");
  });
});
