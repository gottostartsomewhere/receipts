import type { Category, Currency, Order } from "./types";

/** Seeded RNG so the demo year is identical on every machine (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Persona {
  currency: Currency;
  foodApps: string[];
  restaurants: { name: string; dishes: string[]; price: [number, number] }[];
  shop: string;
  products: { name: string; price: [number, number] }[];
  foodOrders: number;
  shopOrders: number;
}

const CHENNAI: Persona = {
  currency: "INR",
  foodApps: ["Swiggy", "Zomato"],
  restaurants: [
    { name: "Hotel Junior Kuppanna", dishes: ["Chicken Biryani (Full)", "Mutton Chukka", "Parotta (2 pcs)"], price: [320, 640] },
    { name: "Thalappakatti", dishes: ["Dindigul Chicken Dum Biryani", "Chicken 65 Boneless", "Mutton Biryani"], price: [350, 780] },
    { name: "A2B Adyar Ananda Bhavan", dishes: ["Ghee Roast Dosa", "Mini Tiffin", "Filter Coffee"], price: [140, 320] },
    { name: "Domino's Pizza", dishes: ["Farmhouse Pizza Medium", "Garlic Breadsticks", "Choco Lava Cake"], price: [420, 890] },
    { name: "Behrouz Biryani", dishes: ["Lazeez Bhuna Murgh Biryani", "Shahi Galouti Kebab"], price: [480, 960] },
    { name: "Burger King", dishes: ["Whopper Meal", "Crispy Veg Burger", "Peri Peri Fries"], price: [260, 540] },
    { name: "Naturals Ice Cream", dishes: ["Tender Coconut Ice Cream 500ml", "Sitaphal Ice Cream"], price: [180, 380] },
    { name: "Murugan Idli Shop", dishes: ["Idli (4 pcs) with Podi", "Pongal", "Medu Vada"], price: [120, 280] },
  ],
  shop: "Amazon",
  products: [
    { name: "boAt Rockerz 255 Pro+ Bluetooth Neckband", price: [999, 1499] },
    { name: "Logitech M331 Silent Plus Wireless Mouse", price: [799, 1099] },
    { name: "Atomic Habits by James Clear (Paperback)", price: [399, 549] },
    { name: "Prestige Iris 750 Watt Mixer Grinder", price: [2899, 3499] },
    { name: "Levi's Men's 511 Slim Fit Jeans", price: [1899, 2999] },
    { name: "Nike Revolution 7 Running Shoes", price: [2995, 3695] },
    { name: "Mi 20000mAh Power Bank", price: [1599, 2199] },
    { name: "Cadbury Dairy Milk Silk 150g (Pack of 3)", price: [480, 560] },
    { name: "Surf Excel Matic Liquid Detergent 2L", price: [430, 520] },
    { name: "Classmate Spiral Notebook (Pack of 6)", price: [280, 360] },
    { name: "Minimalist 10% Niacinamide Face Serum", price: [549, 599] },
    { name: "Milton Thermosteel Flask 1L", price: [899, 1199] },
    { name: "Bournvita Health Drink 1kg Jar", price: [420, 480] },
    { name: "Cello Butterflow Pens (Pack of 10)", price: [140, 190] },
    { name: "Wipro 9W LED Bulb (Pack of 4)", price: [399, 499] },
    { name: "Apple AirPods Pro (3rd generation)", price: [24900, 26900] },
  ],
  foodOrders: 214,
  shopOrders: 41,
};

const SEATTLE: Persona = {
  currency: "USD",
  foodApps: ["DoorDash", "Uber Eats"],
  restaurants: [
    { name: "Dick's Drive-In", dishes: ["Deluxe Burger", "Fries", "Chocolate Shake"], price: [14, 28] },
    { name: "Din Tai Fung", dishes: ["Pork Xiao Long Bao (10)", "Shrimp Fried Rice", "Spicy Wontons"], price: [32, 68] },
    { name: "Taco Time NW", dishes: ["Crisp Burrito", "Mexi-Fries", "Soft Taco Supreme"], price: [16, 34] },
    { name: "Pagliacci Pizza", dishes: ["Pagliaccio Primo Pizza Large", "Caesar Salad"], price: [28, 52] },
    { name: "Pho Bac", dishes: ["Beef Pho Large", "Spring Rolls"], price: [18, 36] },
    { name: "Molly Moon's", dishes: ["Salted Caramel Pint", "Honey Lavender Pint"], price: [14, 26] },
  ],
  shop: "Amazon",
  products: [
    { name: "Anker 737 Power Bank 24,000mAh", price: [89, 129] },
    { name: "Atomic Habits by James Clear (Hardcover)", price: [14, 19] },
    { name: "Logitech MX Master 3S Wireless Mouse", price: [89, 99] },
    { name: "Hydro Flask 32 oz Wide Mouth", price: [39, 49] },
    { name: "Bounty Paper Towels, 12 Double Rolls", price: [29, 36] },
    { name: "Nike Pegasus 41 Running Shoes", price: [119, 139] },
    { name: "CeraVe Moisturizing Cream 19oz", price: [16, 19] },
    { name: "Apple AirPods Pro (3rd generation)", price: [229, 249] },
    { name: "Ninja AF101 Air Fryer", price: [79, 99] },
    { name: "Kirkland Signature Mixed Nuts 2.5lb", price: [17, 22] },
    { name: "Moleskine Classic Notebook, Large", price: [19, 24] },
    { name: "Philips Hue White A19 Bulbs (4 pack)", price: [44, 54] },
  ],
  foodOrders: 168,
  shopOrders: 37,
};

export type PersonaId = "chennai" | "seattle";

export const PERSONAS: Record<PersonaId, { label: string; persona: Persona }> = {
  chennai: { label: "Chennai, ₹", persona: CHENNAI },
  seattle: { label: "Seattle, $", persona: SEATTLE },
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A believable year of orders up to `untilMonth` (1-12) in `year`. */
export function sampleOrders(id: PersonaId, year: number, untilMonth = 11): Order[] {
  const p = PERSONAS[id].persona;
  const rand = rng(id === "chennai" ? 2026 : 98101);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const between = ([lo, hi]: [number, number]) => lo + rand() * (hi - lo);
  const day = () => {
    const month = 1 + Math.floor(rand() * untilMonth);
    const dim = new Date(year, month, 0).getDate();
    return `${year}-${pad(month)}-${pad(1 + Math.floor(rand() * dim))}`;
  };
  const money = (x: number) => (p.currency === "INR" ? Math.round(x) : Math.round(x * 100) / 100);
  const orders: Order[] = [];

  // Favourite restaurant gets ordered from far more often, so the year has a story.
  const weighted = [p.restaurants[0], p.restaurants[0], p.restaurants[0], p.restaurants[1], ...p.restaurants];
  for (let i = 0; i < p.foodOrders; i++) {
    const r = pick(weighted);
    const late = rand() < 0.38;
    const hour = late ? pick([22, 23, 23, 0, 0, 1, 2]) : pick([12, 13, 13, 14, 19, 20, 20, 21]);
    const dishCount = 1 + Math.floor(rand() * 2);
    const items = Array.from({ length: dishCount }, () => ({ name: pick(r.dishes), qty: 1 + Math.floor(rand() * 2) }));
    orders.push({
      id: `food-${i}`,
      store: "sample",
      merchant: `${pick(p.foodApps)} · ${r.name}`,
      date: day(),
      hour,
      total: money(between(r.price)),
      currency: p.currency,
      status: rand() < 0.03 ? "cancelled" : "delivered",
      items,
      knownCategory: "food_delivery" as Category,
    });
  }
  // The last product is the one big splurge of the year: bought exactly once.
  const everyday = p.products.slice(0, -1);
  const splurge = p.products[p.products.length - 1];
  for (let i = 0; i < p.shopOrders; i++) {
    const n = rand() < 0.75 ? 1 : 2;
    const products = i === Math.floor(p.shopOrders / 2) ? [splurge] : Array.from({ length: n }, () => pick(everyday));
    orders.push({
      id: `shop-${i}`,
      store: "sample",
      merchant: p.shop,
      date: day(),
      total: money(products.reduce((sum, x) => sum + between(x.price), 0)),
      currency: p.currency,
      status: rand() < 0.06 ? "refunded" : "delivered",
      items: products.map((x) => ({ name: x.name, qty: 1 })),
    });
  }
  return orders.sort((a, b) => a.date.localeCompare(b.date));
}
