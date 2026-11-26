// "Would a membership have paid off?" Instead of guessing today's membership prices (they
// change often), Receipts shows the break-even price: the most a year of membership could cost
// and still save money, worked out from the delivery fees actually paid to that app.

import type { FeeReport } from "./fees";

export interface MembershipOffer {
  shop: string;
  name: string;
  /** Fee kinds the membership waives on eligible orders (kept conservative). */
  covers: string[];
}

export const MEMBERSHIPS: MembershipOffer[] = [
  { shop: "Swiggy", name: "Swiggy One", covers: ["delivery fee", "surge fee"] },
  { shop: "Zomato", name: "Zomato Gold", covers: ["delivery fee"] },
  { shop: "DoorDash", name: "DashPass", covers: ["delivery fee"] },
  { shop: "Uber Eats", name: "Uber One", covers: ["delivery fee"] },
  { shop: "Instacart", name: "Instacart+", covers: ["delivery fee"] },
  { shop: "Blinkit", name: "Blinkit membership", covers: ["delivery fee", "small order fee"] },
];

export interface BreakEven {
  shop: string;
  name: string;
  /** Covered fees paid so far this year. */
  paid: number;
  /** The same rate over twelve months: the most a yearly membership could cost and still pay off. */
  perYear: number;
  times: number;
}

/** `monthsSoFar` is how many months of the year the orders cover (11 in late November). */
export function breakEvens(report: FeeReport, monthsSoFar: number): BreakEven[] {
  const months = Math.min(12, Math.max(1, monthsSoFar));
  return MEMBERSHIPS.map((m) => {
    const covered = report.lines.filter((l) => l.shop.toLowerCase() === m.shop.toLowerCase() && m.covers.includes(l.label));
    const paid = covered.reduce((n, l) => n + l.amount, 0);
    const times = covered.reduce((n, l) => n + l.times, 0);
    return { shop: m.shop, name: m.name, paid: Math.round(paid * 100) / 100, perYear: Math.round((paid * 12) / months), times };
  })
    .filter((b) => b.paid > 0)
    .sort((a, b) => b.paid - a.paid);
}
