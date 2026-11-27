import type { Category, Currency, Fee, Order } from "./types";

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

/** Another app with its own fees: quick commerce (Blinkit) or tickets (BookMyShow). */
interface ExtraShop {
  shop: string;
  /** Places shown as "Place (Shop)", like cinemas on BookMyShow; omitted means the shop itself. */
  places?: string[];
  orders: number;
  products: { name: string; price: [number, number] }[];
  /** How many different products go in one order. */
  perOrder: [number, number];
  category: Category;
  /** Hours the orders land at; omitted when the shop doesn't show the time. */
  hours?: number[];
  fees: (subtotal: number, qty: number, rand: () => number) => Fee[];
}

interface Persona {
  currency: Currency;
  foodApps: string[];
  restaurants: { name: string; dishes: string[]; price: [number, number] }[];
  shop: string;
  products: { name: string; price: [number, number] }[];
  foodOrders: number;
  shopOrders: number;
  extras?: ExtraShop[];
}

// Quick commerce charges a handling fee on most baskets, a small cart fee and delivery on
// small ones, and a rain or surge fee now and then.
function blinkitFees(subtotal: number, _qty: number, rand: () => number): Fee[] {
  const fees: Fee[] = [{ label: "handling fee", amount: 2 + Math.round(rand() * 9) }];
  if (subtotal < 150) fees.push({ label: "small cart fee", amount: 20 + Math.round(rand() * 15) });
  if (subtotal < 200) fees.push({ label: "delivery fee", amount: 25 + Math.round(rand() * 5) });
  if (rand() < 0.1) fees.push({ label: "rain fee", amount: 15 + Math.round(rand() * 15) });
  return fees;
}

// Ticket apps charge a convenience fee per ticket, plus GST on that fee.
function ticketFees(_subtotal: number, qty: number, rand: () => number): Fee[] {
  return [{ label: "convenience fee", amount: qty * (24 + rand() * 12) * 1.18 }];
}

const CHENNAI: Persona = {
  currency: "INR",
  foodApps: ["Swiggy"],
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
  foodOrders: 176,
  shopOrders: 41,
  extras: [
    {
      shop: "Blinkit",
      orders: 52,
      products: [
        { name: "Amul Taaza Toned Milk 1L", price: [68, 72] },
        { name: "Britannia 100% Whole Wheat Bread 400g", price: [55, 60] },
        { name: "Maggi 2-Minute Masala Noodles (Pack of 12)", price: [168, 180] },
        { name: "Onion 1kg", price: [38, 55] },
        { name: "Tomato (Local) 500g", price: [24, 40] },
        { name: "Lay's India's Magic Masala 52g", price: [20, 20] },
        { name: "Coca-Cola 750ml", price: [40, 45] },
        { name: "Amul Butter 100g", price: [58, 62] },
        { name: "Farm Fresh Eggs (Pack of 12)", price: [96, 110] },
        { name: "Kurkure Masala Munch 90g", price: [20, 20] },
        { name: "Aashirvaad Shudh Chakki Atta 5kg", price: [265, 295] },
      ],
      perOrder: [1, 4],
      category: "groceries",
      hours: [8, 9, 18, 19, 21, 22, 23, 23, 0, 1],
      fees: blinkitFees,
    },
    {
      shop: "BookMyShow",
      places: ["PVR Grand Galada", "INOX Chennai Citi Centre", "Rohini Silver Screens", "AGS Cinemas OMR"],
      orders: 9,
      products: [{ name: "Movie tickets", price: [190, 420] }],
      perOrder: [1, 1],
      category: "entertainment",
      fees: ticketFees,
    },
  ],
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

/**
 * Fees in the shape the real apps charge them: a flat platform fee on every Indian food order,
 * packing charges at some restaurants, delivery and late-night fees sometimes; a percentage
 * service fee and a small-order fee on US apps.
 */
function foodFees(currency: Currency, app: string, food: number, hour: number, rand: () => number): Fee[] {
  const fees: Fee[] = [];
  if (currency === "INR") {
    fees.push({ label: "platform fee", amount: app === "Swiggy" ? 14.99 : 12.5 });
    if (rand() < 0.6) fees.push({ label: "packing charges", amount: 10 + Math.round(rand() * 30) });
    if (rand() < 0.35) fees.push({ label: "delivery fee", amount: 25 + Math.round(rand() * 20) });
    if ((hour >= 23 || hour < 3) && rand() < 0.5) fees.push({ label: "late night fee", amount: 15 + Math.round(rand() * 10) });
    if (rand() < 0.08) fees.push({ label: "surge fee", amount: 20 + Math.round(rand() * 10) });
  } else {
    fees.push({ label: "service fee", amount: Math.min(15, Math.max(3, food * 0.15)) });
    if (rand() < 0.55) fees.push({ label: "delivery fee", amount: 0.99 + Math.round(rand() * 4) });
    if (food < 15) fees.push({ label: "small order fee", amount: 2 });
  }
  return fees;
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
    const app = pick(p.foodApps);
    const food = between(r.price);
    const fees = foodFees(p.currency, app, food, hour, rand).map((f) => ({ ...f, amount: money(f.amount) }));
    orders.push({
      id: `food-${i}`,
      store: "sample",
      merchant: `${r.name} (${app})`,
      date: day(),
      hour,
      total: money(food + fees.reduce((n, f) => n + f.amount, 0)),
      currency: p.currency,
      status: rand() < 0.03 ? "cancelled" : "delivered",
      items,
      fees,
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
      // The splurge always arrives, so the year keeps its biggest-buy story.
      status: rand() < 0.06 && !products.includes(splurge) ? "refunded" : "delivered",
      items: products.map((x) => ({ name: x.name, qty: 1 })),
    });
  }
  for (const x of p.extras ?? []) {
    for (let i = 0; i < x.orders; i++) {
      const kinds = x.perOrder[0] + Math.floor(rand() * (x.perOrder[1] - x.perOrder[0] + 1));
      const items = Array.from({ length: kinds }, () => ({ product: pick(x.products), qty: 1 + Math.floor(rand() * 2) }));
      const subtotal = items.reduce((n, it) => n + between(it.product.price) * it.qty, 0);
      const qty = items.reduce((n, it) => n + it.qty, 0);
      const fees = x.fees(subtotal, qty, rand).map((f) => ({ ...f, amount: money(f.amount) }));
      orders.push({
        id: `${x.shop.toLowerCase()}-${i}`,
        store: "sample",
        merchant: x.places ? `${pick(x.places)} (${x.shop})` : x.shop,
        date: day(),
        hour: x.hours ? pick(x.hours) : undefined,
        total: money(subtotal + fees.reduce((n, f) => n + f.amount, 0)),
        currency: p.currency,
        status: "delivered",
        items: items.map((it) => ({ name: it.product.name, qty: it.qty })),
        fees,
        knownCategory: x.category,
      });
    }
  }
  return orders.sort((a, b) => a.date.localeCompare(b.date));
}
