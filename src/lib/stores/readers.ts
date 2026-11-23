import type { Order, StoreId } from "../types";
import { parseDishString, parseLooseDate, parseMoney, parseSqlTime, parseZomatoTime, statusFrom } from "./parse";
import { closeTab, navigateTab, NotSignedIn, openBackgroundTab, runInTab } from "./tab";

export interface StoreInfo {
  id: Exclude<StoreId, "sample">;
  label: string;
  origins: string[];
}

export const STORES: StoreInfo[] = [
  { id: "amazon_in", label: "Amazon.in", origins: ["https://www.amazon.in/*"] },
  { id: "amazon_com", label: "Amazon.com", origins: ["https://www.amazon.com/*"] },
  { id: "swiggy", label: "Swiggy", origins: ["https://www.swiggy.com/*"] },
  { id: "zomato", label: "Zomato", origins: ["https://www.zomato.com/*"] },
];

export type ReadProgress = (ordersSoFar: Order[]) => void;

// ---------- Functions that run inside the store page (must be self-contained) ----------

interface AmazonRow {
  orderNo: string;
  placed: string;
  total: string;
  titles: string[];
  text: string;
}

/** Reads the rendered "Your Orders" page. Never reads the "Ship to" / "Deliver to" field. */
async function amazonPage(): Promise<AmazonRow[] | "signin"> {
  if (/\/ap\/signin|\/ax\/claim/.test(location.pathname)) return "signin";
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const deadline = Date.now() + 12_000;
  let cards: Element[] = [];
  while (Date.now() < deadline) {
    cards = [...document.querySelectorAll(".order-card.js-order-card")];
    const withTitles = cards.filter((c) => c.querySelector(".yohtmlc-product-title")).length;
    // Amazon fills item titles in after load; a few order types (services) never have one.
    if (cards.length > 0 && withTitles >= Math.max(1, cards.length - 3)) break;
    if (cards.length === 0 && document.querySelector(".your-orders-content-container") && Date.now() > deadline - 9_000) break;
    await sleep(300);
  }
  await sleep(400);
  cards = [...document.querySelectorAll(".order-card.js-order-card")];
  return cards.map((card) => {
    const row: AmazonRow = { orderNo: "", placed: "", total: "", titles: [], text: "" };
    for (const li of card.querySelectorAll(".order-header__header-list-item")) {
      const lines = (li as HTMLElement).innerText.split("\n").map((s) => s.trim()).filter(Boolean);
      const head = (lines[0] ?? "").toUpperCase();
      if (head.startsWith("ORDER PLACED")) row.placed = lines.slice(1).join(" ") || head.replace("ORDER PLACED", "");
      else if (head.startsWith("TOTAL")) row.total = lines.slice(1).join(" ") || head.replace("TOTAL", "");
      else if (head.startsWith("ORDER #")) row.orderNo = head.replace("ORDER #", "").trim() || (lines[1] ?? "");
    }
    row.titles = [...card.querySelectorAll(".yohtmlc-product-title")].map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean);
    if (row.titles.length === 0) {
      row.titles = [...card.querySelectorAll("img[alt]")].map((i) => (i as HTMLImageElement).alt.trim()).filter((a) => a.length > 3);
    }
    // Only the delivery status line, used to spot cancelled or refunded orders.
    row.text = [...card.querySelectorAll(".yohtmlc-shipment-status-primaryText, .delivery-box__primary-text, .a-color-success, .a-color-error")]
      .map((e) => (e as HTMLElement).innerText)
      .join(" ");
    return row;
  });
}

interface SwiggyRow {
  id: string;
  time: string;
  total: number;
  restaurant: string;
  status: string;
  items: { name: string; qty: number }[];
}

/** Pages through Swiggy's order history API from inside swiggy.com. Takes only these fields. */
async function swiggyOrders(year: number): Promise<{ signedIn: boolean; rows: SwiggyRow[] }> {
  const rows: SwiggyRow[] = [];
  let cursor = "";
  for (let page = 0; page < 80; page++) {
    const res = await fetch(`/dapi/order/all?order_id=${encodeURIComponent(cursor)}`, { credentials: "include" });
    const json = await res.json();
    const orders: Record<string, unknown>[] = json?.data?.orders ?? [];
    if (json?.statusCode !== 0 && orders.length === 0) return { signedIn: page > 0, rows };
    if (orders.length === 0) break;
    let reachedOlder = false;
    for (const o of orders as any[]) {
      const time = String(o.order_time ?? o.orderTime ?? "");
      const y = Number(time.slice(0, 4));
      if (y && y < year) {
        reachedOlder = true;
        continue;
      }
      if (y && y > year) continue;
      rows.push({
        id: String(o.order_id ?? o.orderId ?? rows.length),
        time,
        total: Number(o.order_total ?? o.net_total ?? o.order_total_with_tip ?? 0),
        restaurant: String(o.restaurant_name ?? o.restaurant?.name ?? "Swiggy"),
        status: String(o.order_status ?? o.status ?? ""),
        items: (o.order_items ?? []).map((it: any) => ({ name: String(it.name ?? ""), qty: Number(it.quantity ?? 1) || 1 })),
      });
    }
    if (reachedOlder) break;
    cursor = String((orders[orders.length - 1] as any).order_id ?? "");
    if (!cursor) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return { signedIn: true, rows };
}

interface ZomatoRow {
  id: string;
  date: string;
  total: string;
  restaurant: string;
  status: string;
  dishes: string;
}

/** Pages through Zomato's order history from inside zomato.com. Takes only these fields. */
async function zomatoOrders(year: number): Promise<ZomatoRow[]> {
  const rows: ZomatoRow[] = [];
  for (let page = 1; page <= 60; page++) {
    const res = await fetch(`/webroutes/user/orders?page=${page}`, { credentials: "include" });
    const json = await res.json();
    const orders = Object.values(json?.entities?.ORDER ?? {}) as any[];
    const section = json?.sections?.SECTION_USER_ORDER_HISTORY;
    if (orders.length === 0) break;
    let reachedOlder = false;
    for (const o of orders) {
      const date = String(o.orderDate ?? "");
      const y = Number((/\b(20\d\d)\b/.exec(date) ?? [])[1]);
      if (y && y < year) {
        reachedOlder = true;
        continue;
      }
      if (y && y > year) continue;
      rows.push({
        id: String(o.orderId ?? o.id ?? rows.length),
        date,
        total: String(o.totalCost ?? o.total ?? ""),
        restaurant: String(o.resInfo?.name ?? "Zomato"),
        status: String(o.deliveryDetails?.deliveryLabel ?? o.deliveryDetails?.deliveryStatus ?? o.status ?? ""),
        dishes: String(o.dishString ?? ""),
      });
    }
    if (reachedOlder || (section?.totalPages && page >= section.totalPages)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return rows;
}

// ---------- Readers (run in the extension) ----------

async function readAmazon(store: StoreInfo, year: number, onProgress: ReadProgress): Promise<Order[]> {
  const domain = store.id === "amazon_in" ? "www.amazon.in" : "www.amazon.com";
  const currency = store.id === "amazon_in" ? "INR" : "USD";
  const base = `https://${domain}/your-orders/orders?timeFilter=year-${year}`;
  const orders = new Map<string, Order>();
  const tabId = await openBackgroundTab(`${base}&startIndex=0`);
  try {
    for (let start = 0; start < 1000; start += 10) {
      if (start > 0) await navigateTab(tabId, `${base}&startIndex=${start}`);
      const rows = await runInTab(tabId, amazonPage, []);
      if (rows === "signin") throw new NotSignedIn(store.label);
      if (!rows || rows.length === 0) break;
      for (const row of rows) {
        const date = parseLooseDate(row.placed);
        if (!date || !date.startsWith(String(year))) continue;
        const id = row.orderNo || `${date}-${orders.size}`;
        orders.set(id, {
          id: `${store.id}-${id}`,
          store: store.id,
          merchant: "Amazon",
          date,
          total: parseMoney(row.total),
          currency,
          status: statusFrom(row.text),
          items: row.titles.map((name) => ({ name, qty: 1 })),
        });
      }
      onProgress([...orders.values()]);
      if (rows.length < 10) break;
    }
  } finally {
    await closeTab(tabId);
  }
  return [...orders.values()];
}

async function readSwiggy(store: StoreInfo, year: number, onProgress: ReadProgress): Promise<Order[]> {
  const tabId = await openBackgroundTab("https://www.swiggy.com/dapi/order/all?order_id=");
  try {
    const { signedIn, rows } = await runInTab(tabId, swiggyOrders, [year]);
    if (!signedIn) throw new NotSignedIn(store.label);
    const orders: Order[] = [];
    for (const r of rows) {
      const t = parseSqlTime(r.time);
      if (!t) continue;
      orders.push({
        id: `swiggy-${r.id}`,
        store: "swiggy",
        merchant: `${r.restaurant} (Swiggy)`,
        date: t.date,
        hour: t.hour,
        total: r.total,
        currency: "INR",
        status: statusFrom(r.status),
        items: r.items.filter((i) => i.name),
        knownCategory: "food_delivery",
      });
    }
    onProgress(orders);
    return orders;
  } finally {
    await closeTab(tabId);
  }
}

async function readZomato(_store: StoreInfo, year: number, onProgress: ReadProgress): Promise<Order[]> {
  const tabId = await openBackgroundTab("https://www.zomato.com/webroutes/user/orders?page=1");
  try {
    const rows = await runInTab(tabId, zomatoOrders, [year]);
    const orders: Order[] = [];
    for (const r of rows ?? []) {
      const t = parseZomatoTime(r.date);
      if (!t) continue;
      orders.push({
        id: `zomato-${r.id}`,
        store: "zomato",
        merchant: `${r.restaurant} (Zomato)`,
        date: t.date,
        hour: t.hour,
        total: parseMoney(r.total),
        currency: "INR",
        status: statusFrom(r.status),
        items: parseDishString(r.dishes),
        knownCategory: "food_delivery",
      });
    }
    onProgress(orders);
    return orders;
  } finally {
    await closeTab(tabId);
  }
}

export function readStore(store: StoreInfo, year: number, onProgress: ReadProgress): Promise<Order[]> {
  if (store.id === "swiggy") return readSwiggy(store, year, onProgress);
  if (store.id === "zomato") return readZomato(store, year, onProgress);
  return readAmazon(store, year, onProgress);
}
