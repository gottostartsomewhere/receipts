import { downloadCanvas, drawCard, type CardSpec } from "./lib/cards";
import { firebaseConfigured, labelModel, nanoState, type NanoState } from "./lib/firebase";
import { labelItems, uniqueItemNames } from "./lib/labeler";
import { getLedger, onLedgerChange, recordRead, type DeviceLedger } from "./lib/ledger";
import { sampleOrders, type PersonaId } from "./lib/sample";
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

// Live store connectors land next; until then the sample years drive the flow.
document.querySelectorAll<HTMLInputElement>('input[name="store"]').forEach((el) => (el.disabled = true));

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
void refreshNano();

$("start").addEventListener("click", async () => {
  const persona = (document.querySelector<HTMLInputElement>('input[name="sample"]:checked')?.value ?? "chennai") as PersonaId;
  const allowCloud = $<HTMLInputElement>("allow-cloud").checked;
  // Chrome only starts a model download from a user gesture, so do it here.
  if (firebaseConfigured && (nano === "downloadable" || nano === "downloading")) {
    $("nano-state").textContent = "DOWNLOADING 0%";
    void labelModel(false)
      .initializeDeviceModel((p) => ($("nano-state").textContent = `DOWNLOADING ${Math.round(p * 100)}%`))
      .then(refreshNano);
  }
  await run(sampleOrders(persona, YEAR), allowCloud);
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

async function run(orders: Order[], allowCloud: boolean) {
  state.orders = orders;
  state.abort = new AbortController();
  $("feed").replaceChildren();
  $("count-orders").textContent = "0";
  $("count-items").textContent = "0";
  setProgress(0);
  show("screen-reading");

  // 1. Orders: structured data from the store, read locally. Quick, so we let it print.
  $("reading-title").textContent = "READING ORDERS";
  const delivered = orders.filter((o) => o.date.startsWith(String(YEAR)));
  for (let i = 0; i < delivered.length; i++) {
    const o = delivered[i];
    $("count-orders").textContent = String(i + 1);
    if (i % 6 === 0 || i === delivered.length - 1) {
      feedLine(o.merchant, formatMoney(o.total, o.currency));
      setProgress((i + 1) / delivered.length);
      await sleep(12);
    }
  }

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
  show("screen-review");
}

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

  const specs: CardSpec[] = [...w.cards, { kicker: w.persona, headline: stayed, line: left }];
  const footer = "Read on my laptop by Gemini Nano. Only a few rounded totals ever reached the cloud.";
  const cards = $("cards");
  cards.replaceChildren();
  drawn = [];
  show("screen-wrapped");
  for (let i = 0; i < specs.length; i++) {
    const canvas = await drawCard(specs[i], { year: p.year, index: i, total: specs.length, footer });
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

$("again").addEventListener("click", () => show("screen-start"));

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

// Keep the key normaliser in the bundle's public surface for the console during the demo.
Object.assign(globalThis, { receiptsDebug: { normalizeName } });
