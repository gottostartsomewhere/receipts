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

export type StoreId = "amazon_in" | "amazon_com" | "swiggy" | "zomato" | "sample";

export type Currency = "INR" | "USD";

export type OrderStatus = "delivered" | "cancelled" | "refunded" | "other";

export interface OrderItem {
  name: string;
  qty: number;
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
