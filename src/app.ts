import { answerQuery, groundQuery, parseQueryLine, ruleQuery, type Query } from "./lib/ask";
import { downloadCanvas, drawCard, type CardSpec } from "./lib/cards";
import { feeReport } from "./lib/fees";
import { breakEvens } from "./lib/memberships";
import { askModel, firebaseConfigured, labelModel, nanoState, warmNano, type NanoState } from "./lib/firebase";
import { privateCards, privateInsights } from "./lib/insights";
import { labelItems, uniqueItemNames } from "./lib/labeler";
import { getLedger, onLedgerChange, recordOnDevice, recordRead, type DeviceLedger } from "./lib/ledger";
import { sampleOrders, type PersonaId } from "./lib/sample";
import { forgetYear, loadTickedShops, loadYear, saveTickedShops, saveYear, type RunSource } from "./lib/store";
import { readPage } from "./lib/stores/anypage";
import { CATALOG, type CatalogShop } from "./lib/stores/catalog";
import { getPages, onPagesChange, removePage, type PageGrab } from "./lib/stores/pages";
import { readCatalogShop, readStore, STORES, type StoreInfo } from "./lib/stores/readers";
import { NotSignedIn } from "./lib/stores/tab";
import { countFacts, formatMoney, normalizeName, summarize, toCloudPayload, type CloudPayload } from "./lib/summary";
import { CATEGORY_NAMES, type Currency, type ItemLabel, type Order } from "./lib/types";
import { localWrapped, writeWrapped, type Wrapped } from "./lib/wrapped";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const screens = ["screen-start", "screen-reading", "screen-home"] as const;
type Screen = (typeof screens)[number];
function show(id: Screen) {
  for (const s of screens) $(s).hidden = s !== id;
  $(id).querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

const YEAR = new Date().getFullYear();
const state: {
  orders: Order[];
  labels: Map<string, ItemLabel>;
  payload?: CloudPayload;
  wrapped?: Wrapped;
  sentToCloud?: boolean;
  source?: RunSource;
  savedAt?: string;
  abort?: AbortController;
} = { orders: [], labels: new Map() };

$("today").textContent = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

// The same page runs as the extension and as a web demo. Reading real shops needs the
// extension (background tabs, the person's sign-ins); the web version offers the demo store
// and sample years.
const IN_EXTENSION = Boolean((globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id);
if (!IN_EXTENSION) {
  document.querySelectorAll<HTMLElement>(".extension-only").forEach((el) => (el.hidden = true));
  $("web-note").hidden = false;
}

// ================= START =================

function refreshStartLabel() {
  const any = [...document.querySelectorAll<HTMLInputElement>('input[name="shop"], input[name="page"]')].some((s) => s.checked);
  const choice = document.querySelector<HTMLInputElement>('input[name="sample"]:checked')?.value;
  $("start").textContent = any ? "READ MY ORDERS" : choice === "demo" ? "READ THE DEMO STORE" : "PRINT A SAMPLE YEAR";
}
document.querySelectorAll<HTMLInputElement>('input[name="sample"]').forEach((el) => el.addEventListener("change", refreshStartLabel));

interface ShopOption {
  id: string;
  label: string;
  region: "IN" | "US";
  beta: boolean;
  origins: string[];
}

const REGION_OF: Record<string, "IN" | "US"> = { amazon_in: "IN", swiggy: "IN", amazon_com: "US" };
const VERIFIED = new Set(["amazon_in", "swiggy"]);
const SHOPS: ShopOption[] = [
  ...STORES.map((s) => ({ id: s.id, label: s.label, region: REGION_OF[s.id] ?? "IN", beta: !VERIFIED.has(s.id), origins: s.origins })),
  ...CATALOG.map((c) => ({ id: c.id, label: c.label, region: c.region, beta: c.beta, origins: c.origins })),
];
const HOME_REGION: "IN" | "US" = /Asia\/(Calcutta|Kolkata)/.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? "IN" : "US";

// Each shop's own icon (its favicon), bundled so the start screen makes no network calls.
const SHOP_ICONS = import.meta.glob<string>("./shops/*.png", { eager: true, query: "?url", import: "default" });

// Shop names as they appear on orders ("Swiggy", "Amazon.in", "Uber Eats") to their icons.
const ICON_BY_NAME: Record<string, string> = {
  swiggy: "swiggy", blinkit: "blinkit", bookmyshow: "bookmyshow", flipkart: "flipkart", myntra: "myntra", ajio: "ajio",
  tatacliq: "tatacliq", jiomart: "jiomart", walmart: "walmart", target: "target", doordash: "doordash", ubereats: "ubereats",
  instacart: "instacart", ebay: "ebay", etsy: "etsy", uber: "uber_in", uberrides: "uber_in", amazonin: "amazon_in", amazoncom: "amazon_com",
};
function iconForShop(name: string): string | undefined {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  const id = ICON_BY_NAME[key] ?? (key === "amazon" ? (HOME_REGION === "IN" ? "amazon_in" : "amazon_com") : undefined);
  return id ? SHOP_ICONS[`./shops/${id}.png`] : undefined;
}
/** Puts the shop's icon in front of the last line added to a list. */
function withShopIcon(list: HTMLElement, shop: string, nameHidden: boolean) {
  const src = iconForShop(shop);
  const dt = list.lastElementChild?.querySelector("dt");
  if (!src || !dt) return;
  const img = document.createElement("img");
  img.className = "row-icon";
  img.src = src;
  img.alt = nameHidden ? shop : "";
  dt.prepend(img);
}

/** A shop as a tile: its icon and name; tap to tick. The checkbox inside keeps it a form field. */
function shopTile(shop: ShopOption, ticked: Set<string>): HTMLElement {
  const tile = document.createElement("label");
  tile.className = "tile";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = "shop";
  input.value = shop.id;
  input.checked = ticked.has(shop.id);
  input.addEventListener("change", refreshStartLabel);
  const icon = document.createElement("img");
  icon.alt = "";
  const src = SHOP_ICONS[`./shops/${shop.id}.png`];
  if (src) icon.src = src;
  else icon.className = "blank";
  const name = document.createElement("span");
  name.className = "tile-name";
  name.textContent = shop.label;
  tile.append(input, icon, name);
  if (shop.beta) {
    const beta = document.createElement("span");
    beta.className = "tile-beta";
    beta.textContent = "beta";
    tile.append(beta);
  }
  return tile;
}

async function renderShops() {
  const ticked = new Set(await loadTickedShops());
  // Up front: the checked shops of your own region. Everything else sits behind "More shops".
  const main = SHOPS.filter((s) => !s.beta && s.region === HOME_REGION);
  const rest = SHOPS.filter((s) => !main.includes(s));
  const box = $("shops");
  box.replaceChildren(...main.map((s) => shopTile(s, ticked)));
  const more = document.createElement("button");
  more.type = "button";
  more.className = "tile tile-more";
  more.id = "more-shops";
  more.innerHTML = `<span class="more-n">+${rest.length}</span><span class="tile-name"></span>`;
  box.append(more);
  const drawer = $("shops-beta");
  drawer.replaceChildren();
  const regions: ("IN" | "US")[] = HOME_REGION === "IN" ? ["IN", "US"] : ["US", "IN"];
  for (const region of regions) {
    const list = rest.filter((s) => s.region === region);
    if (!list.length) continue;
    const h = document.createElement("p");
    h.className = "label";
    h.textContent = region === "IN" ? "India" : "United States";
    const grid = document.createElement("div");
    grid.className = "tiles";
    grid.append(...list.map((s) => shopTile(s, ticked)));
    drawer.append(h, grid);
  }
  const setOpen = (open: boolean) => {
    drawer.hidden = !open;
    more.setAttribute("aria-expanded", String(open));
    more.classList.toggle("open", open);
    more.querySelector(".tile-name")!.textContent = open ? "Fewer shops" : "More shops";
  };
  more.addEventListener("click", () => setOpen(drawer.hidden === true));
  // Open the drawer if something in it was ticked last time.
  setOpen(rest.some((s) => ticked.has(s.id)));
  refreshStartLabel();
}
void renderShops();

let pages: PageGrab[] = [];
async function renderPages() {
  pages = await getPages();
  const list = $("pages-list");
  list.replaceChildren();
  for (const p of pages) {
    const row = document.createElement("label");
    row.className = "line check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.name = "page";
    box.value = p.url;
    box.checked = true;
    box.addEventListener("change", refreshStartLabel);
    const name = document.createElement("span");
    name.textContent = p.host;
    const dots = document.createElement("span");
    dots.className = "dots";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "tag-button";
    remove.textContent = "remove";
    remove.setAttribute("aria-label", `Remove ${p.host}`);
    remove.addEventListener("click", (e) => {
      e.preventDefault();
      void removePage(p.url);
    });
    row.append(box, name, dots, remove);
    list.append(row);
  }
  refreshStartLabel();
}
void renderPages();
onPagesChange(() => void renderPages());

let nano: NanoState = "unavailable";
async function refreshNano() {
  nano = await nanoState();
  const text: Record<NanoState, string> = {
    available: "READY",
    downloadable: "NEEDS DOWNLOAD",
    downloading: "DOWNLOADING",
    unavailable: "NOT ON THIS DEVICE",
  };
  $("nano-state").textContent = text[nano];
  $("nano-chip").dataset.state = nano;
  $("cloud-optin").hidden = nano !== "unavailable" || !firebaseConfigured;
}
void refreshNano().then(() => {
  if (nano === "available") void warmNano();
});

/** Works out what to read from the start screen. */
function chosenSource(): { source: RunSource; stores: StoreInfo[]; shops: CatalogShop[]; pages: PageGrab[] } {
  const ticked = new Set([...document.querySelectorAll<HTMLInputElement>('input[name="shop"]:checked')].map((b) => b.value));
  const stores = STORES.filter((s) => ticked.has(s.id));
  const shops = CATALOG.filter((c) => ticked.has(c.id));
  const pageUrls = new Set([...document.querySelectorAll<HTMLInputElement>('input[name="page"]:checked')].map((b) => b.value));
  const chosenPages = pages.filter((p) => pageUrls.has(p.url));
  if (stores.length || shops.length || chosenPages.length) {
    const label = [...stores.map((s) => s.label), ...shops.map((s) => s.label), ...chosenPages.map((p) => p.host)].join(", ");
    return { source: { kind: "shops", shops: [...ticked], pages: [...pageUrls], label }, stores, shops, pages: chosenPages };
  }
  const pick = document.querySelector<HTMLInputElement>('input[name="sample"]:checked')?.value ?? "demo";
  if (pick === "demo") return { source: { kind: "demo", label: "Demo store (made up)" }, stores, shops, pages: [] };
  const persona = pick === "seattle" ? "seattle" : "chennai";
  return { source: { kind: "sample", persona, label: `Sample year: ${persona === "seattle" ? "Seattle" : "Chennai"}` }, stores, shops, pages: [] };
}

/** Rebuilds the same reading plan from a saved source, for "Read again". */
function planFor(source: RunSource): { stores: StoreInfo[]; shops: CatalogShop[]; pages: PageGrab[] } {
  const ids = new Set(source.shops ?? []);
  const urls = new Set(source.pages ?? []);
  return { stores: STORES.filter((s) => ids.has(s.id)), shops: CATALOG.filter((c) => ids.has(c.id)), pages: pages.filter((p) => urls.has(p.url)) };
}

async function begin(source: RunSource, stores: StoreInfo[], shops: CatalogShop[], chosenPages: PageGrab[]) {
  // Ask for access to only the chosen shops. This must be the first await, inside the click.
  const origins = [...new Set([...stores, ...shops].flatMap((s) => s.origins))];
  if (origins.length) {
    const granted = await chrome.permissions.request({ origins });
    if (!granted) {
      $("start-note").textContent = "Receipts needs permission to open those shops' order pages. Nothing was read.";
      $("start-note").hidden = false;
      show("screen-start");
      return;
    }
  }
  // Chrome only starts a model download from a user gesture, so do it here.
  if (firebaseConfigured && (nano === "downloadable" || nano === "downloading")) {
    $("nano-state").textContent = "DOWNLOADING 0%";
    void labelModel(false)
      .initializeDeviceModel((p) => ($("nano-state").textContent = `DOWNLOADING ${Math.round(p * 100)}%`))
      .then(refreshNano);
  }
  if (source.kind === "shops") void saveTickedShops(source.shops ?? []);
  const allowCloud = $<HTMLInputElement>("allow-cloud").checked;
  const load =
    source.kind === "shops"
      ? async () => [...(await loadStores(stores)), ...(await loadCatalog(shops)), ...(await loadPages(chosenPages))]
      : source.kind === "demo"
        ? () => loadDemo()
        : () => loadSample((source.persona ?? "chennai") as PersonaId);
  await run(source, load, allowCloud);
}

$("start").addEventListener("click", () => {
  const { source, stores, shops, pages: chosenPages } = chosenSource();
  void begin(source, stores, shops, chosenPages);
});

$("back-home").addEventListener("click", () => void showHome());

// ================= READING =================

function feedLine(what: string, amount: string, became?: string, stamp?: { kind: string; text: string }) {
  const li = document.createElement("li");
  const w = document.createElement("span");
  w.className = "what";
  w.textContent = what;
  const a = document.createElement("span");
  a.className = "amount";
  a.textContent = amount;
  li.append(w, a);
  if (became) {
    const b = document.createElement("span");
    b.className = "became";
    b.textContent = became;
    if (stamp) {
      const s = document.createElement("span");
      s.className = `stamp ${stamp.kind}`;
      s.textContent = stamp.text;
      b.append(s);
    }
    li.append(b);
  }
  const feed = $("feed");
  feed.prepend(li);
  while (feed.children.length > 14) feed.lastElementChild?.remove();
}

function setProgress(fraction: number) {
  const p = $("progress");
  const pct = Math.round(fraction * 100);
  p.setAttribute("aria-valuenow", String(pct));
  (p.firstElementChild as HTMLElement).style.width = `${pct}%`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let timer: ReturnType<typeof setInterval> | undefined;
function startTimer() {
  const began = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - began) / 1000);
    $("elapsed").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}
const stopTimer = () => clearInterval(timer);

/** Prints a sample year quickly, the way a real read would arrive. */
async function loadSample(persona: PersonaId): Promise<Order[]> {
  $("reading-hint").textContent = "Sample year: no shops to open. Nano still labels every item.";
  const orders = sampleOrders(persona, YEAR);
  for (let i = 0; i < orders.length; i++) {
    $("count-orders").textContent = String(i + 1);
    if (i % 6 === 0 || i === orders.length - 1) {
      feedLine(orders[i].merchant, formatMoney(orders[i].total, orders[i].currency));
      setProgress((i + 1) / orders.length);
      await sleep(12);
    }
  }
  return orders;
}

/** Reads each chosen store in a background tab. A store that fails is skipped, not fatal. */
async function loadStores(stores: StoreInfo[]): Promise<Order[]> {
  const all: Order[] = [];
  for (const [n, store] of stores.entries()) {
    $("reading-title").textContent = `READING ${store.label}`;
    $("reading-hint").textContent = `${store.label}: reading your order history in a background tab.`;
    feedLine(`Opening ${store.label} in a background tab`, "");
    let printed = 0;
    try {
      const orders = await readStore(store, YEAR, (soFar) => {
        for (const o of soFar.slice(printed)) feedLine(o.merchant, formatMoney(o.total, o.currency));
        printed = soFar.length;
        $("count-orders").textContent = String(all.length + soFar.length);
      });
      all.push(...orders);
      feedLine(`${store.label}: ${orders.length} orders in ${YEAR}`, "DONE");
    } catch (err) {
      console.warn(`Receipts: could not read ${store.label}`, err);
      feedLine(err instanceof NotSignedIn ? `${store.label}: not signed in` : `${store.label}: could not read`, "SKIPPED");
    }
    $("count-orders").textContent = String(all.length);
    setProgress((n + 1) / Math.max(1, stores.length));
  }
  return all;
}

/** Renders a page in an off-screen frame and returns its visible text, like a shop tab would. */
function renderedText(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.src = src;
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;visibility:hidden;";
    frame.addEventListener("load", () => {
      const text = frame.contentDocument?.querySelector<HTMLElement>("main")?.innerText ?? frame.contentDocument?.body.innerText ?? "";
      frame.remove();
      text ? resolve(text) : reject(new Error("The demo store page was empty"));
    });
    frame.addEventListener("error", () => reject(new Error("Could not open the demo store page")));
    document.body.append(frame);
  });
}

/**
 * The demo store: a made-up order page read exactly like a real shop. Because its orders are
 * not anyone's data, a machine without Nano may let the cloud read it instead.
 */
async function loadDemo(): Promise<Order[]> {
  $("reading-title").textContent = nano === "available" ? "GEMINI NANO IS READING THE DEMO STORE" : "READING THE DEMO STORE";
  $("reading-hint").textContent =
    nano === "available" ? "Nano reads about one order every few seconds on a laptop like this." : "No Nano here, so the cloud reads this made-up page.";
  if (!firebaseConfigured) {
    feedLine("Demo store: Firebase is not set up in this build", "SKIPPED");
    return [];
  }
  feedLine(nano === "available" ? "Opening the demo store page" : "No Nano here: the cloud reads the made-up demo page", "");
  const text = await renderedText("./demo-shop.html");
  const page: PageGrab = { url: new URL("./demo-shop.html", location.href).href, host: "halfway.market (demo)", title: "Halfway Market", text, at: Date.now() };
  const orders: Order[] = [];
  const found = await readPage(
    page,
    YEAR,
    (o) => {
      orders.push(o);
      feedLine(`${o.items[0]?.name ?? o.merchant}${o.status === "delivered" ? "" : ` (${o.status})`}`, formatMoney(o.total, o.currency));
      $("count-orders").textContent = String(orders.length);
    },
    state.abort?.signal,
    { shopName: "Halfway Market", demoPage: true },
  );
  feedLine(`Demo store: ${found.length} orders, each checked against the page`, "DONE");
  return found;
}

/** Catalog shops: background tab with the person's sign-in, then Nano reads the page on the laptop. */
async function loadCatalog(shops: CatalogShop[]): Promise<Order[]> {
  const all: Order[] = [];
  for (const shop of shops) {
    $("reading-title").textContent = `READING ${shop.label}`;
    $("reading-hint").textContent = `${shop.label}: loading the year in a background tab, then Nano reads it.`;
    if (nano !== "available" || !firebaseConfigured) {
      feedLine(`${shop.label}: needs Gemini Nano on this laptop`, "SKIPPED");
      continue;
    }
    feedLine(`Opening ${shop.label} in a background tab`, "");
    try {
      const found = await readCatalogShop(
        shop,
        YEAR,
        (o) => {
          all.push(o);
          feedLine(`${o.merchant}: ${o.items[0]?.name ?? ""}`, formatMoney(o.total, o.currency));
          $("count-orders").textContent = String(Number($("count-orders").textContent) + 1);
        },
        state.abort?.signal,
      );
      feedLine(found.length ? `${shop.label}: ${found.length} orders, each checked against the page` : `${shop.label}: no ${YEAR} orders found`, "DONE");
    } catch (err) {
      console.warn(`Receipts: could not read ${shop.label}`, err);
      feedLine(err instanceof NotSignedIn ? `${shop.label}: not signed in` : `${shop.label}: could not read`, "SKIPPED");
    }
  }
  return all;
}

/** Nano reads the orders off each page the person added. Needs Nano: a whole page never goes to the cloud. */
async function loadPages(chosen: PageGrab[]): Promise<Order[]> {
  const all: Order[] = [];
  for (const page of chosen) {
    $("reading-title").textContent = `GEMINI NANO IS READING ${page.host}`;
    if (nano !== "available" || !firebaseConfigured) {
      feedLine(`${page.host}: needs Gemini Nano on this laptop`, "SKIPPED");
      continue;
    }
    feedLine(`Reading ${page.host}`, "");
    try {
      const found = await readPage(
        page,
        YEAR,
        (o) => {
          all.push(o);
          feedLine(`${o.merchant}: ${o.items[0]?.name ?? ""}`, formatMoney(o.total, o.currency));
          $("count-orders").textContent = String(Number($("count-orders").textContent) + 1);
        },
        state.abort?.signal,
      );
      feedLine(`${page.host}: ${found.length} orders checked against the page`, "DONE");
    } catch (err) {
      console.warn(`Receipts: could not read ${page.host}`, err);
      feedLine(`${page.host}: could not read`, "SKIPPED");
    }
  }
  return all;
}

async function run(source: RunSource, load: () => Promise<Order[]>, allowCloud: boolean) {
  state.abort = new AbortController();
  $("feed").replaceChildren();
  $("count-orders").textContent = "0";
  $("count-items").textContent = "0";
  $("start-note").hidden = true;
  setProgress(0);
  show("screen-reading");
  startTimer();

  // 1. Orders, read on this laptop.
  $("reading-title").textContent = "READING ORDERS";
  const orders = await load();
  const delivered = orders.filter((o) => o.date.startsWith(String(YEAR)));
  if (delivered.length === 0) {
    stopTimer();
    $("start-note").textContent = `No ${YEAR} orders found. Sign in to the shop in Chrome first, or try the demo store.`;
    $("start-note").hidden = false;
    show("screen-start");
    return;
  }

  // 2. Items: Gemini Nano turns messy product names into labels, on this laptop.
  const names = uniqueItemNames(delivered);
  const itemCount = delivered.reduce((n, o) => n + o.items.reduce((m, it) => m + it.qty, 0), 0);
  await recordRead(delivered.length, itemCount);
  $("reading-title").textContent = nano === "available" ? "GEMINI NANO IS READING YOUR ITEMS" : "UNDERSTANDING YOUR ITEMS";
  $("reading-hint").textContent = "Turning product names into things you would recognise.";
  setProgress(0);
  const labels = await labelItems(names, {
    allowCloud,
    signal: state.abort.signal,
    onProgress: (p) => {
      $("count-items").textContent = String(p.done);
      setProgress(p.total ? p.done / p.total : 1);
      const stamp =
        p.source === "in_cloud"
          ? { kind: "cloud", text: "CLOUD" }
          : p.source === "rules"
            ? { kind: "rules", text: "LOCAL RULES" }
            : { kind: "device", text: "ON DEVICE" };
      for (const { name, label } of p.latest) feedLine(name, "", `${label.label} (${CATEGORY_NAMES[label.category]})`, stamp);
    },
  });
  stopTimer();

  // 3. Keep the year in this browser, so reopening Receipts shows it straight away.
  state.orders = orders;
  state.labels = labels;
  state.source = source;
  state.wrapped = undefined;
  state.sentToCloud = false;
  state.savedAt = new Date().toISOString();
  await persist();
  await showHome();
}

$("stop").addEventListener("click", () => state.abort?.abort());

async function persist() {
  if (!state.source) return;
  await saveYear({
    year: YEAR,
    savedAt: state.savedAt ?? new Date().toISOString(),
    source: state.source,
    orders: state.orders,
    labels: [...state.labels.entries()],
    wrapped: state.wrapped,
    sentToCloud: state.sentToCloud,
  });
}

// ================= YOUR YEAR =================

const FIELD_NAMES: Partial<Record<keyof CloudPayload, string>> = {
  year: "Year",
  currency: "Currency",
  total_spend_rounded: "Total spent (rounded)",
  orders: "Orders",
  top_category: "Top category",
  top_category_percent: "Top category share",
  favourite_item: "Most-ordered item",
  favourite_item_count: "Times ordered",
  busiest_month: "Busiest month",
  biggest_order_rounded: "Biggest order (rounded)",
  biggest_order_item: "Biggest order was",
  late_night_percent: "Orders after 10pm",
  fees_rounded: "Fees on top (rounded)",
  fee_share_percent: "Fees as a share of spend",
};

function displayValue(key: keyof CloudPayload, value: unknown, p: CloudPayload): string {
  if (key === "total_spend_rounded" || key === "biggest_order_rounded" || key === "fees_rounded") return formatMoney(Number(value), p.currency);
  if (key === "top_category_percent" || key === "late_night_percent" || key === "fee_share_percent") return `${value}%`;
  return String(value);
}

/** One "label ....... value" receipt line. */
function line(dl: HTMLElement, label: string, value: string, strong = false) {
  const row = document.createElement("div");
  if (strong) row.className = "strong";
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dots = document.createElement("span");
  dots.className = "dots";
  const dd = document.createElement("dd");
  dd.textContent = value;
  row.append(dt, dots, dd);
  dl.append(row);
}

function selectTab(name: "wrapped" | "fees" | "ask") {
  for (const t of ["wrapped", "fees", "ask"] as const) {
    $(`tab-${t}`).setAttribute("aria-selected", String(t === name));
    $(`panel-${t}`).hidden = t !== name;
  }
}
for (const t of ["wrapped", "fees", "ask"] as const) $(`tab-${t}`).addEventListener("click", () => selectTab(t));

async function showHome() {
  const summary = summarize(state.orders, state.labels, YEAR);
  const payload = toCloudPayload(summary);
  state.payload = payload;
  const fees = feeReport(state.orders, YEAR);

  // Summary block
  const head = $("home-summary");
  head.replaceChildren();
  line(head, "Year", String(YEAR));
  line(head, "Orders", summary.orderCount.toLocaleString());
  line(head, "Spent", formatMoney(summary.totalSpend, summary.currency), true);
  line(head, "Fees on top", fees.total > 0 ? formatMoney(fees.total, summary.currency) : "none shown", fees.total > 0);
  line(head, "Read from", state.source?.label ?? "");

  // Wrapped tab: review first, cards once made
  renderReview(summary.orderCount, summary.itemCount, payload);
  if (state.wrapped) await renderWrapped(state.wrapped);
  else {
    $("review").hidden = false;
    $("wrapped").hidden = true;
  }

  renderFees(fees, summary.currency);
  setUpAsk(summary.topLabels[0]?.label, summary.busiestMonth.month, summary.lateNightShare !== undefined, fees.total > 0);

  const when = state.savedAt ? new Date(state.savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  $("saved-note").textContent = `Saved in this browser only${when ? `, ${when}` : ""}. Nothing is uploaded; "Forget this year" deletes it.`;
  $("read-again").hidden = !state.source || (state.source.kind === "shops" && !IN_EXTENSION);
  $("back-home").hidden = false;
  selectTab("wrapped");
  show("screen-home");
}

function renderReview(orderCount: number, itemCount: number, payload: CloudPayload) {
  const dl = $("payload");
  dl.replaceChildren();
  for (const [key, value] of Object.entries(payload) as [keyof CloudPayload, unknown][]) {
    if (value === undefined) continue;
    line(dl, FIELD_NAMES[key] ?? key, displayValue(key, value, payload));
  }
  $("review-note").textContent =
    `${orderCount} orders and ${itemCount} items were read on this laptop. ` +
    `These ${countFacts(payload)} facts are all Gemini in the cloud would see to write your Wrapped: no item list, no dates, no addresses, no exact amounts.`;
  const send = $<HTMLButtonElement>("send");
  send.textContent = firebaseConfigured ? `SEND THESE ${countFacts(payload)} FACTS TO GEMINI` : "CLOUD NOT SET UP YET";
  send.disabled = !firebaseConfigured;
  $("send-error").hidden = true;
}

function renderFees(report: ReturnType<typeof feeReport>, currency: Currency) {
  const box = $("fees-receipt");
  box.replaceChildren();
  const m = (n: number) => formatMoney(n, currency);
  const p = (text: string, cls: string) => {
    const el = document.createElement("p");
    el.className = cls;
    el.textContent = text;
    box.append(el);
  };
  if (report.total <= 0) {
    p("NO FEES FOUND", "section-title");
    p("Amazon and Flipkart order lists don't show fees. Swiggy, BookMyShow and food or grocery apps do, so read one of those to see what you paid on top.", "note");
    return;
  }
  const big = document.createElement("div");
  big.className = "fee-total";
  const kicker = document.createElement("span");
  kicker.textContent = "FEES ON TOP OF WHAT YOU BOUGHT";
  const amount = document.createElement("span");
  amount.className = "big";
  amount.textContent = m(report.total);
  const sub = document.createElement("span");
  sub.textContent = `${(report.share * 100).toFixed(1)}% of what you spent, on ${report.ordersWithFees} order${report.ordersWithFees === 1 ? "" : "s"}`;
  big.append(kicker, amount, sub);
  box.append(big);

  p("BY APP", "fees-head");
  const byApp = document.createElement("dl");
  byApp.className = "payload";
  for (const s of report.byShop) {
    line(byApp, s.shop, m(s.amount));
    withShopIcon(byApp, s.shop, false);
  }
  box.append(byApp);

  p("EVERY KIND OF FEE", "fees-head");
  const byKind = document.createElement("dl");
  byKind.className = "payload";
  for (const l of report.lines) {
    // with the shop's icon in front, the shop's name doesn't need repeating on every line
    const icon = Boolean(iconForShop(l.shop));
    line(byKind, icon ? `${l.label} ×${l.times}` : `${l.shop} ${l.label} ×${l.times}`, m(l.amount));
    if (icon) withShopIcon(byKind, l.shop, true);
  }
  line(byKind, "Total fees", m(report.total), true);
  box.append(byKind);

  if (report.largest) {
    const d = new Date(`${report.largest.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    p(`Largest single fee: ${report.largest.shop} ${report.largest.label}, ${m(report.largest.amount)} on ${d}.`, "small-note");
  }

  // Fees by month, as printed bars.
  const monthsSoFar = new Date().getFullYear() === YEAR ? new Date().getMonth() + 1 : 12;
  p("FEES BY MONTH", "fees-head");
  const chart = document.createElement("div");
  chart.className = "month-chart";
  chart.setAttribute("role", "img");
  const peak = Math.max(...report.byMonth.slice(0, monthsSoFar), 1);
  const labelParts: string[] = [];
  report.byMonth.slice(0, monthsSoFar).forEach((amount, i) => {
    const name = new Date(YEAR, i, 1).toLocaleDateString("en-GB", { month: "short" });
    labelParts.push(`${name} ${m(Math.round(amount))}`);
    const row = document.createElement("div");
    row.className = "month-row";
    const mo = document.createElement("span");
    mo.textContent = name;
    const track = document.createElement("span");
    track.className = "track";
    const bar = document.createElement("span");
    bar.className = "bar";
    bar.style.width = `${Math.round((amount / peak) * 100)}%`;
    track.append(bar);
    const v = document.createElement("span");
    v.className = "v";
    v.textContent = amount > 0 ? m(Math.round(amount)) : "";
    row.append(mo, track, v);
    chart.append(row);
  });
  chart.setAttribute("aria-label", `Fees by month: ${labelParts.join(", ")}`);
  box.append(chart);

  // Would a membership have paid off? Shown as a break-even price, so no price is guessed.
  const offers = breakEvens(report, monthsSoFar);
  if (offers.length) {
    p("WOULD A MEMBERSHIP HAVE PAID OFF?", "fees-head");
    const dl = document.createElement("dl");
    dl.className = "payload";
    for (const o of offers) {
      line(dl, o.name, `worth it under ${m(o.perYear)}/yr`, true);
      withShopIcon(dl, o.shop, false);
    }
    box.append(dl);
    // one short line of working per offer; the break-even is the number that matters
    for (const o of offers) p(`${o.name}: ${m(o.paid)} of fees it waives, on ${o.times} order${o.times === 1 ? "" : "s"} so far.`, "small-note");
    p("Prices change, so check the app.", "small-note");
  }
  p("Fees added late at checkout are what India's consumer regulator calls drip pricing. A fee counts here only if it is printed on that order.", "small-note");
}

// ================= ASK =================

function setUpAsk(favourite: string | undefined, busiestMonth: string, hasHours: boolean, hasFees: boolean) {
  $("answers").replaceChildren();
  const chips = $("ask-chips");
  chips.replaceChildren();
  const examples = [
    hasFees ? "How much did I pay in fees?" : "",
    favourite ? `How much did I spend on ${favourite}?` : "",
    `What was my biggest order in ${busiestMonth}?`,
    hasHours ? "How many orders after 10pm?" : "",
  ].filter(Boolean);
  for (const ex of examples) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = ex;
    b.addEventListener("click", () => void ask(ex));
    chips.append(b);
  }
}

async function ask(question: string) {
  const q = question.trim();
  if (!q) return;
  const li = document.createElement("li");
  const qEl = document.createElement("div");
  qEl.className = "q";
  qEl.textContent = q;
  const aEl = document.createElement("div");
  aEl.className = "a";
  aEl.textContent = nano === "available" ? "Gemini Nano is reading the question..." : "Reading the question...";
  const dEl = document.createElement("div");
  dEl.className = "d";
  li.append(qEl, aEl, dEl);
  $("answers").prepend(li);

  const known = [...new Set([...state.labels.values()].map((l) => l.label))].slice(0, 60);
  let query: Query | null = null;
  let how: { kind: string; text: string } = { kind: "rules", text: "LOCAL RULES" };
  if (firebaseConfigured && nano === "available") {
    try {
      const res = await askModel().generateContent(`Known items: ${known.join(", ")}.\nQuestion: ${q}`);
      const parsed = parseQueryLine(res.response.text());
      query = parsed && groundQuery(parsed, q);
      await recordOnDevice();
      if (query) how = { kind: "device", text: "ON DEVICE" };
    } catch (err) {
      console.warn("Receipts: Nano could not read the question, using local rules", err);
    }
  }
  query ??= ruleQuery(q, known);
  const answer = answerQuery(query, state.orders, state.labels, YEAR);

  aEl.replaceChildren();
  const l = document.createElement("span");
  l.textContent = answer.label;
  const dots = document.createElement("span");
  dots.className = "dots";
  const v = document.createElement("span");
  v.textContent = answer.value;
  aEl.append(l, dots, v);
  dEl.textContent = `${answer.detail} `;
  const s = document.createElement("span");
  s.className = `stamp ${how.kind}`;
  s.textContent = how.text;
  dEl.append(s);
}

$("ask-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("ask-input");
  void ask(input.value);
  input.value = "";
});

// ================= WRAPPED =================

$("send").addEventListener("click", async () => {
  if (!state.payload) return;
  const btn = $<HTMLButtonElement>("send");
  btn.disabled = true;
  btn.textContent = "GEMINI IS WRITING...";
  $("send-error").hidden = true;
  try {
    state.wrapped = await writeWrapped(state.payload);
    state.sentToCloud = true;
    await persist();
    await renderWrapped(state.wrapped);
  } catch (err) {
    console.error(err);
    $("send-error").textContent = `The cloud call failed (${err instanceof Error ? err.message : String(err)}). Nothing else was sent. You can keep it local instead.`;
    $("send-error").hidden = false;
    btn.disabled = false;
    btn.textContent = "TRY AGAIN";
  }
});

$("keep-local").addEventListener("click", async () => {
  if (!state.payload) return;
  state.wrapped = localWrapped(state.payload);
  state.sentToCloud = false;
  await persist();
  await renderWrapped(state.wrapped);
});

let drawn: { canvas: HTMLCanvasElement; name: string }[] = [];

async function renderWrapped(w: Wrapped) {
  const p = state.payload!;
  const facts = w.source === "in_cloud" ? countFacts(p) : 0;
  const stayed = `${p.orders.toLocaleString()} orders stayed on my laptop.`;
  const left = facts ? `${facts} facts left it.` : "Nothing left it.";
  $("review").hidden = true;
  $("wrapped").hidden = false;

  $("persona").textContent = w.persona.toUpperCase();
  $("roast").textContent = w.roast;
  $("comparison").textContent = w.comparison;
  const closing = $("closing");
  closing.replaceChildren();
  const big = document.createElement("span");
  big.className = "big";
  big.textContent = stayed.replace("my laptop", "your laptop");
  const small = document.createElement("span");
  small.textContent = left;
  closing.append(big, small);

  // Cloud-written cards first, then cards that only ever existed on this laptop, then the closer.
  const insights = privateInsights(state.orders, state.labels, p.year);
  const specs: (CardSpec & { stamp?: string })[] = [
    ...w.cards,
    ...privateCards(insights, p.currency).map((c) => ({ ...c, stamp: "Never left my laptop" })),
    { kicker: w.persona, headline: stayed, line: left },
  ];
  const footer = "Read on my laptop by Gemini Nano. Only a few rounded totals ever reached the cloud.";
  const cards = $("cards");
  cards.replaceChildren();
  drawn = [];
  for (let i = 0; i < specs.length; i++) {
    const canvas = await drawCard(specs[i], { year: p.year, index: i, total: specs.length, footer, stamp: specs[i].stamp });
    const name = `receipts-${p.year}-${i + 1}.png`;
    drawn.push({ canvas, name });
    const fig = document.createElement("figure");
    fig.className = "card-shot";
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    img.alt = `${specs[i].kicker}: ${specs[i].headline.replace(/\.$/, "")}. ${specs[i].line}`;
    const save = document.createElement("button");
    save.type = "button";
    save.className = "save";
    save.textContent = "Save";
    save.addEventListener("click", () => void downloadCanvas(canvas, name));
    fig.append(img, save);
    cards.append(fig);
  }
}

$("save-all").addEventListener("click", async () => {
  for (const d of drawn) {
    await downloadCanvas(d.canvas, d.name);
    await sleep(250);
  }
});

// ================= HOME ACTIONS =================

$("read-again").addEventListener("click", () => {
  if (!state.source) return;
  const plan = planFor(state.source);
  void begin(state.source, plan.stores, plan.shops, plan.pages);
});

$("change-shops").addEventListener("click", () => show("screen-start"));

let forgetArmed = false;
$("forget").addEventListener("click", async () => {
  const btn = $("forget");
  if (!forgetArmed) {
    forgetArmed = true;
    btn.textContent = "Tap again to delete it from this browser";
    setTimeout(() => {
      forgetArmed = false;
      btn.textContent = "Forget this year";
    }, 4000);
    return;
  }
  forgetArmed = false;
  btn.textContent = "Forget this year";
  await forgetYear();
  state.orders = [];
  state.labels = new Map();
  state.wrapped = undefined;
  state.source = undefined;
  $("back-home").hidden = true;
  show("screen-start");
});

// ================= WHAT LEFT THIS DEVICE =================

function renderLedger(l: DeviceLedger) {
  const body = $("ledger-body");
  body.replaceChildren();
  const row = (k: string, v: string) => {
    const d = document.createElement("div");
    d.className = "row";
    const a = document.createElement("span");
    a.textContent = k;
    const b = document.createElement("span");
    b.textContent = v;
    d.append(a, b);
    body.append(d);
  };
  row("Orders read on this laptop", l.ordersReadLocally.toLocaleString());
  row("Items read on this laptop", l.itemsReadLocally.toLocaleString());
  row("Gemini Nano calls (on device)", l.onDeviceCalls.toLocaleString());
  row("Requests to the cloud", String(l.cloudCalls.length));
  for (const call of l.cloudCalls) {
    const h = document.createElement("p");
    h.textContent = `${call.purpose}, ${call.model}, ${new Date(call.at).toLocaleString()}`;
    const pre = document.createElement("pre");
    pre.textContent = call.sent;
    body.append(h, pre);
  }
}
void getLedger().then(renderLedger);
onLedgerChange(renderLedger);

// ================= OPEN WHERE YOU LEFT OFF =================

void loadYear().then(async (saved) => {
  if (!saved || saved.year !== YEAR || !saved.orders?.length) return;
  state.orders = saved.orders;
  state.labels = new Map(saved.labels ?? []);
  state.source = saved.source;
  state.wrapped = saved.wrapped;
  state.sentToCloud = saved.sentToCloud;
  state.savedAt = saved.savedAt;
  await showHome();
});

// Console hooks for testing on a dev machine. They run the same on-device code paths as the UI.
Object.assign(globalThis, {
  receiptsDebug: {
    normalizeName,
    readPageText: (text: string, host = "example.com") =>
      readPage({ url: `https://${host}/orders`, host, title: host, text, at: Date.now() }, YEAR, (o) => console.log("Receipts debug order", o)),
  },
});
