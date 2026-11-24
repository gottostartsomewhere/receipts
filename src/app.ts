import { answerQuery, groundQuery, parseQueryLine, ruleQuery, type Query } from "./lib/ask";
import { downloadCanvas, drawCard, type CardSpec } from "./lib/cards";
import { askModel, firebaseConfigured, labelModel, nanoState, warmNano, type NanoState } from "./lib/firebase";
import { privateCards, privateInsights } from "./lib/insights";
import { labelItems, uniqueItemNames } from "./lib/labeler";
import { getLedger, onLedgerChange, recordOnDevice, recordRead, type DeviceLedger } from "./lib/ledger";
import { sampleOrders, type PersonaId } from "./lib/sample";
import { CATALOG, type CatalogShop } from "./lib/stores/catalog";
import { readCatalogShop, readStore, STORES, type StoreInfo } from "./lib/stores/readers";
import { readPage } from "./lib/stores/anypage";
import { getPages, onPagesChange, removePage, type PageGrab } from "./lib/stores/pages";
import { NotSignedIn } from "./lib/stores/tab";
import { countFacts, formatMoney, normalizeName, summarize, toCloudPayload, type CloudPayload } from "./lib/summary";
import { CATEGORY_NAMES, type ItemLabel, type Order } from "./lib/types";
import { localWrapped, writeWrapped, type Wrapped } from "./lib/wrapped";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const screens = ["screen-start", "screen-reading", "screen-review", "screen-wrapped"] as const;
function show(id: (typeof screens)[number]) {
  for (const s of screens) $(s).hidden = s !== id;
  $(id).querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
}

const YEAR = new Date().getFullYear();
const state: { orders: Order[]; labels: Map<string, ItemLabel>; payload?: CloudPayload; abort?: AbortController } = {
  orders: [],
  labels: new Map(),
};

// ---------- Start screen ----------

$("today").textContent = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

// Pick shops or added pages, or leave them all unticked to use a sample year.
function refreshStartLabel() {
  const any = [...document.querySelectorAll<HTMLInputElement>('input[name="shop"], input[name="page"]')].some((s) => s.checked);
  $("start").textContent = any ? "READ MY ORDERS" : "PRINT A SAMPLE YEAR";
}

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

function renderShops() {
  const home: "IN" | "US" = Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Calcutta" || Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Kolkata" ? "IN" : "US";
  const regions: ("IN" | "US")[] = home === "IN" ? ["IN", "US"] : ["US", "IN"];
  const box = $("shops");
  box.replaceChildren();
  for (const region of regions) {
    const h = document.createElement("p");
    h.className = "shops-region";
    h.textContent = region === "IN" ? "India" : "United States";
    const grid = document.createElement("div");
    grid.className = "shops-grid";
    for (const shop of SHOPS.filter((s) => s.region === region)) {
      const row = document.createElement("label");
      row.className = "shop check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "shop";
      input.value = shop.id;
      input.addEventListener("change", refreshStartLabel);
      const name = document.createElement("span");
      name.textContent = shop.label;
      row.append(input, name);
      if (shop.beta) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "beta";
        row.append(tag);
      }
      grid.append(row);
    }
    box.append(h, grid);
  }
}
renderShops();

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
  $("cloud-optin").hidden = nano !== "unavailable" || !firebaseConfigured;
}
void refreshNano().then(() => {
  if (nano === "available") void warmNano();
});

$("start").addEventListener("click", async () => {
  const persona = (document.querySelector<HTMLInputElement>('input[name="sample"]:checked')?.value ?? "chennai") as PersonaId;
  const allowCloud = $<HTMLInputElement>("allow-cloud").checked;
  const ticked = new Set([...document.querySelectorAll<HTMLInputElement>('input[name="shop"]:checked')].map((b) => b.value));
  const chosen = STORES.filter((s) => ticked.has(s.id));
  const chosenShops = CATALOG.filter((c) => ticked.has(c.id));
  const chosenPages = pages.filter((p) => [...document.querySelectorAll<HTMLInputElement>('input[name="page"]:checked')].some((b) => b.value === p.url));
  // Ask for access to only the chosen shops. This must be the first await, inside the click.
  const origins = [...new Set([...chosen, ...chosenShops].flatMap((s) => s.origins))];
  if (origins.length) {
    const granted = await chrome.permissions.request({ origins });
    if (!granted) {
      $("start-note").textContent = "Receipts needs permission to open those stores' order pages. Nothing was read.";
      $("start-note").hidden = false;
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
  const real = chosen.length > 0 || chosenShops.length > 0 || chosenPages.length > 0;
  await run(
    real
      ? async () => [...(await loadStores(chosen)), ...(await loadCatalog(chosenShops)), ...(await loadPages(chosenPages))]
      : () => loadSample(persona),
    allowCloud,
  );
});

// ---------- Reading + labelling ----------

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

/** Prints a sample year quickly, the way a real read would arrive. */
async function loadSample(persona: PersonaId): Promise<Order[]> {
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
    setProgress((n + 1) / stores.length);
  }
  return all;
}

/** Catalog shops: background tab with the person's sign-in, then Nano reads the page on the laptop. */
async function loadCatalog(shops: CatalogShop[]): Promise<Order[]> {
  const all: Order[] = [];
  for (const shop of shops) {
    $("reading-title").textContent = `READING ${shop.label}`;
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
          feedLine(`${o.merchant}: ${o.items[0] ?? ""}`, formatMoney(o.total, o.currency), undefined);
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

async function run(load: () => Promise<Order[]>, allowCloud: boolean) {
  state.abort = new AbortController();
  $("feed").replaceChildren();
  $("count-orders").textContent = "0";
  $("count-items").textContent = "0";
  $("start-note").hidden = true;
  $("ask").hidden = true;
  setProgress(0);
  show("screen-reading");

  // 1. Orders: structured data from the store, read on this laptop.
  $("reading-title").textContent = "READING ORDERS";
  const orders = await load();
  const delivered = orders.filter((o) => o.date.startsWith(String(YEAR)));
  if (delivered.length === 0) {
    $("start-note").textContent = `No ${YEAR} orders found. Sign in to the store in Chrome first, or try a sample year.`;
    $("start-note").hidden = false;
    show("screen-start");
    return;
  }
  state.orders = orders;

  // 2. Items: Gemini Nano turns messy product names into labels, on this laptop.
  const names = uniqueItemNames(delivered);
  const itemCount = delivered.reduce((n, o) => n + o.items.reduce((m, it) => m + it.qty, 0), 0);
  await recordRead(delivered.length, itemCount);
  $("reading-title").textContent = nano === "available" ? "GEMINI NANO IS READING YOUR ITEMS" : "UNDERSTANDING YOUR ITEMS";
  setProgress(0);
  state.labels = await labelItems(names, {
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
      for (const { name, label } of p.latest) {
        feedLine(name, "", `${label.label} (${CATEGORY_NAMES[label.category]})`, stamp);
      }
    },
  });

  review();
}

$("stop").addEventListener("click", () => state.abort?.abort());

// ---------- Review: show exactly what would leave ----------

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
};

function displayValue(key: keyof CloudPayload, value: unknown, p: CloudPayload): string {
  if (key === "total_spend_rounded" || key === "biggest_order_rounded") return formatMoney(Number(value), p.currency);
  if (key === "top_category_percent" || key === "late_night_percent") return `${value}%`;
  return String(value);
}

function review() {
  const summary = summarize(state.orders, state.labels, YEAR);
  const payload = toCloudPayload(summary);
  state.payload = payload;
  const dl = $("payload");
  dl.replaceChildren();
  for (const [key, value] of Object.entries(payload) as [keyof CloudPayload, unknown][]) {
    if (value === undefined) continue;
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = FIELD_NAMES[key] ?? key;
    const dots = document.createElement("span");
    dots.className = "dots";
    const dd = document.createElement("dd");
    dd.textContent = displayValue(key, value, payload);
    row.append(dt, dots, dd);
    dl.append(row);
  }
  $("review-note").textContent =
    `${summary.orderCount} orders and ${summary.itemCount} items were read on this laptop. ` +
    `These ${countFacts(payload)} facts are all Gemini in the cloud would see: no item list, no dates, no addresses, no exact amounts.`;
  $("send").textContent = firebaseConfigured ? `SEND THESE ${countFacts(payload)} FACTS TO GEMINI` : "CLOUD NOT SET UP YET";
  $<HTMLButtonElement>("send").disabled = !firebaseConfigured;
  setUpAsk(summary.topLabels[0]?.label, summary.busiestMonth.month, summary.lateNightShare !== undefined);
  show("screen-review");
}

// ---------- Ask your receipts ----------

function setUpAsk(favourite: string | undefined, busiestMonth: string, hasHours: boolean) {
  $("answers").replaceChildren();
  const chips = $("ask-chips");
  chips.replaceChildren();
  const examples = [
    favourite ? `How much did I spend on ${favourite}?` : "",
    `What was my biggest order in ${busiestMonth}?`,
    hasHours ? "How many orders after 10pm?" : "How many orders in October?",
  ].filter(Boolean);
  for (const ex of examples) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = ex;
    b.addEventListener("click", () => void ask(ex));
    chips.append(b);
  }
  $("ask").hidden = false;
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

$("send").addEventListener("click", async () => {
  if (!state.payload) return;
  const btn = $<HTMLButtonElement>("send");
  btn.disabled = true;
  btn.textContent = "GEMINI IS WRITING...";
  $("send-error").hidden = true;
  try {
    await renderWrapped(await writeWrapped(state.payload));
  } catch (err) {
    console.error(err);
    $("send-error").textContent = `The cloud call failed (${err instanceof Error ? err.message : String(err)}). Nothing else was sent. You can keep it local instead.`;
    $("send-error").hidden = false;
    btn.disabled = false;
    btn.textContent = "TRY AGAIN";
  }
});

$("keep-local").addEventListener("click", () => {
  if (state.payload) void renderWrapped(localWrapped(state.payload));
});

// ---------- Wrapped ----------

let drawn: { canvas: HTMLCanvasElement; name: string }[] = [];

async function renderWrapped(w: Wrapped) {
  const p = state.payload!;
  const facts = w.source === "in_cloud" ? countFacts(p) : 0;
  const stayed = `${p.orders.toLocaleString()} orders stayed on my laptop.`;
  const left = facts ? `${facts} facts left it.` : "Nothing left it.";

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
  show("screen-wrapped");
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

$("again").addEventListener("click", () => {
  $("ask").hidden = true;
  show("screen-start");
});

// ---------- What left this device ----------

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

// Console hooks for testing on a dev machine. They run the same on-device code paths as the UI.
Object.assign(globalThis, {
  receiptsDebug: {
    normalizeName,
    readPageText: (text: string, host = "example.com") =>
      readPage({ url: `https://${host}/orders`, host, title: host, text, at: Date.now() }, YEAR, (o) => console.log("Receipts debug order", o)),
  },
});
