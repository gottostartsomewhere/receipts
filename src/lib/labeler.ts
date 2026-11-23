import { CLOUD_LABEL_MODEL, firebaseConfigured, labelModel, nanoState } from "./firebase";
import { recordCloud, recordOnDevice } from "./ledger";
import { normalizeName } from "./summary";
import { CATEGORIES, type Category, type ItemLabel, type Order } from "./types";

const CACHE_KEY = "labels:v1";
const BATCH = 10;

// ---------- Local rules: the fallback when Nano is missing and the cloud is not allowed ----------

const RULES: [RegExp, Category][] = [
  [/biryani|pizza|burger|dosa|idli|parotta|naan|paneer|kebab|fries|meal|pho|taco|burrito|wonton|xiao long|ramen|thali|vada|pongal|tiffin|curry|65|chukka|coffee|shake|ice cream|pint/, "food_delivery"],
  [/chips|chocolate|cadbury|silk|nuts|biscuit|cookie|namkeen/, "snacks"],
  [/milk|detergent|surf|bournvita|rice|atta|oil|paper towel|bounty|soap|shampoo/, "groceries"],
  [/neckband|earbuds|airpods|headphone|mouse|keyboard|power bank|charger|cable|phone|laptop|monitor|bulb|hue|speaker/, "electronics"],
  [/jeans|shirt|t-shirt|shoes|sneaker|kurta|dress|jacket|socks|pegasus|revolution/, "fashion"],
  [/paperback|hardcover|book|novel|habits/, "books"],
  [/grinder|mixer|flask|bottle|hydro flask|air fryer|cookware|pan|bedsheet|pillow/, "home"],
  [/serum|cream|foundation|lipstick|moistur|niacinamide|sunscreen|face wash/, "beauty"],
  [/notebook|pen|pencil|moleskine|classmate|stapler/, "stationery"],
  [/uber|ola|flight|train|bus|hotel/, "travel"],
  [/ticket|cinema|pvr|netflix|concert/, "entertainment"],
];

function ruleLabel(name: string): ItemLabel {
  const n = normalizeName(name);
  const category = RULES.find(([re]) => re.test(n))?.[1] ?? "other";
  const words = n
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["with", "and", "pack", "for", "the", "men", "women"].includes(w));
  return { label: words.slice(-2).join(" ") || n.slice(0, 20), category, source: "rules" };
}

// ---------- Cache ----------

async function loadCache(): Promise<Record<string, ItemLabel>> {
  try {
    const got = await chrome.storage.local.get(CACHE_KEY);
    return (got[CACHE_KEY] as Record<string, ItemLabel> | undefined) ?? {};
  } catch {
    return {};
  }
}

async function saveCache(cache: Record<string, ItemLabel>) {
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  } catch {
    /* in-memory only */
  }
}

export async function clearLabelCache() {
  try {
    await chrome.storage.local.remove(CACHE_KEY);
  } catch {
    /* nothing to clear */
  }
}

// ---------- Labelling ----------

export function uniqueItemNames(orders: Order[]): string[] {
  const seen = new Map<string, string>();
  for (const o of orders) for (const it of o.items) {
    const key = normalizeName(it.name);
    if (!seen.has(key)) seen.set(key, it.name);
  }
  return [...seen.values()];
}

export interface LabelProgress {
  done: number;
  total: number;
  latest: { name: string; label: ItemLabel }[];
  source: "on_device" | "in_cloud" | "rules" | "cache";
}

export interface LabelOptions {
  allowCloud: boolean;
  signal?: AbortSignal;
  onProgress?: (p: LabelProgress) => void;
}

function isCategory(x: unknown): x is Category {
  return typeof x === "string" && (CATEGORIES as readonly string[]).includes(x);
}

export async function labelItems(names: string[], opts: LabelOptions): Promise<Map<string, ItemLabel>> {
  const cache = await loadCache();
  const out = new Map<string, ItemLabel>();
  const todo: string[] = [];
  for (const name of names) {
    const hit = cache[normalizeName(name)];
    if (hit) out.set(normalizeName(name), hit);
    else todo.push(name);
  }
  let done = names.length - todo.length;
  opts.onProgress?.({ done, total: names.length, latest: [], source: "cache" });
  if (todo.length === 0) return out;

  const nano = await nanoState();
  const canModel = firebaseConfigured && (nano === "available" || opts.allowCloud);

  if (!canModel) {
    for (const name of todo) {
      const l = ruleLabel(name);
      out.set(normalizeName(name), l);
      cache[normalizeName(name)] = l;
    }
    await saveCache(cache);
    opts.onProgress?.({ done: names.length, total: names.length, latest: todo.map((name) => ({ name, label: out.get(normalizeName(name))! })), source: "rules" });
    return out;
  }

  const model = labelModel(opts.allowCloud);
  for (let i = 0; i < todo.length; i += BATCH) {
    if (opts.signal?.aborted) break;
    const batch = todo.slice(i, i + BATCH);
    const prompt = batch.map((name, j) => `${j + 1}. ${name}`).join("\n");
    let parsed: { id: number; label: string; category: string }[] = [];
    let source: LabelProgress["source"] = "on_device";
    try {
      const result = await model.generateContent(prompt);
      source = result.response.inferenceSource === "in_cloud" ? "in_cloud" : "on_device";
      if (source === "in_cloud") {
        await recordCloud({ purpose: "Label items (you allowed this)", model: CLOUD_LABEL_MODEL, sent: batch.join("\n") });
      } else {
        await recordOnDevice();
      }
      parsed = (JSON.parse(result.response.text()) as { items?: typeof parsed }).items ?? [];
    } catch (err) {
      console.warn("Receipts: labelling batch failed, using local rules for it", err);
      source = "rules";
    }
    const latest: LabelProgress["latest"] = [];
    batch.forEach((name, j) => {
      const hit = parsed.find((p) => p.id === j + 1);
      const label: ItemLabel =
        hit && isCategory(hit.category) && hit.label
          ? { label: hit.label.toLowerCase().trim().slice(0, 32), category: hit.category, source: source === "in_cloud" ? "in_cloud" : "on_device" }
          : ruleLabel(name);
      out.set(normalizeName(name), label);
      cache[normalizeName(name)] = label;
      latest.push({ name, label });
    });
    done += batch.length;
    await saveCache(cache);
    opts.onProgress?.({ done, total: names.length, latest, source });
  }
  // Anything skipped by an abort still gets a local label so the summary is complete.
  for (const name of todo) if (!out.has(normalizeName(name))) out.set(normalizeName(name), ruleLabel(name));
  return out;
}

export { ruleLabel };
