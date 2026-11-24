export const CATEGORIES = [
  "food_delivery",
  "groceries",
  "snacks",
  "electronics",
  "fashion",
  "books",
  "home",
  "beauty",
  "travel",
  "entertainment",
  "stationery",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_NAMES: Record<Category, string> = {
  food_delivery: "Food delivery",
  groceries: "Groceries",
  snacks: "Snacks",
  electronics: "Electronics",
  fashion: "Fashion",
  books: "Books",
  home: "Home",
  beauty: "Beauty",
  travel: "Travel",
  entertainment: "Entertainment",
  stationery: "Stationery",
  other: "Other",
};

export type StoreId = "amazon_in" | "amazon_com" | "swiggy" | "zomato" | "web" | "sample";

export type Currency = "INR" | "USD";

export type OrderStatus = "delivered" | "cancelled" | "refunded" | "other";

export interface OrderItem {
  name: string;
  qty: number;
}

/** A charge on top of what was bought: platform, delivery, packing, convenience, handling... */
export interface Fee {
  label: string;
  amount: number;
}

const FEE_SYNONYMS: [RegExp, string][] = [
  [/platform/, "platform fee"],
  [/convenience|booking fee|internet handling/, "convenience fee"],
  [/delivery|shipping/, "delivery fee"],
  [/pack/, "packing charges"],
  [/handling/, "handling fee"],
  [/small (cart|order|basket)|cart fee|minimum order/, "small order fee"],
  [/service/, "service fee"],
  [/late ?night|night fee/, "late night fee"],
  [/surge|rain|busy|peak/, "surge fee"],
  [/cancel/, "cancellation fee"],
];

/** Different apps name the same fee differently; this puts them in one bucket. */
export function normalizeFeeLabel(raw: string): string {
  const s = raw.toLowerCase().trim();
  return FEE_SYNONYMS.find(([re]) => re.test(s))?.[1] ?? s.replace(/\s+/g, " ").slice(0, 30);
}

export interface Order {
  id: string;
  store: StoreId;
  /** Display name of the shop, e.g. "Amazon" or a restaurant name. */
  merchant: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Hour of day 0-23 when the store reports it (food apps do, Amazon does not). */
  hour?: number;
  total: number;
  currency: Currency;
  status: OrderStatus;
  items: OrderItem[];
  /** Charges on top of the items, when the shop shows them. Included in `total`. */
  fees?: Fee[];
  /** Food delivery apps are food by definition; other stores need Nano to label items. */
  knownCategory?: Category;
}

export type LabelSource = "on_device" | "in_cloud" | "rules";

export interface ItemLabel {
  /** Short everyday name, 1-3 lowercase words, e.g. "biryani". */
  label: string;
  category: Category;
  source: LabelSource;
}
