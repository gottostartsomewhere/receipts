import { CLOUD_LABEL_MODEL, firebaseConfigured, LABEL_BATCH, labelModel, nanoState, parseLabelLine } from "./firebase";
import { recordCloud, recordOnDevice } from "./ledger";
import { normalizeName } from "./summary";
import type { Category, ItemLabel, Order } from "./types";

// v2: generic labels ("biryani", not "chicken biryani") from the one-line-per-item format.
const CACHE_KEY = "labels:v2";

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
  const set = (name: string, label: ItemLabel) => {
    out.set(normalizeName(name), label);
    cache[normalizeName(name)] = label;
  };

  if (!canModel) {
    const latest = todo.map((name) => {
      const label = ruleLabel(name);
      set(name, label);
      return { name, label };
    });
    await saveCache(cache);
    opts.onProgress?.({ done: names.length, total: names.length, latest, source: "rules" });
    return out;
  }

  // With Nano present, PREFER_ON_DEVICE stays on the laptop; without it, the person opted in.
  const goesToCloud = opts.allowCloud && nano !== "available";
  const model = labelModel(opts.allowCloud);

  for (let i = 0; i < todo.length; i += LABEL_BATCH) {
    if (opts.signal?.aborted) break;
    const batch = todo.slice(i, i + LABEL_BATCH);
    const prompt = batch.map((name, j) => `${j + 1}. ${name}`).join("\n");
    const labelled = new Set<number>();
    let source: LabelProgress["source"] = goesToCloud ? "in_cloud" : "on_device";

    // Each line is printed the moment Nano finishes it, so the receipt prints item by item.
    const take = (line: string) => {
      const parsed = parseLabelLine(line);
      if (!parsed || parsed.id < 1 || parsed.id > batch.length || labelled.has(parsed.id)) return;
      labelled.add(parsed.id);
      const name = batch[parsed.id - 1];
      const label: ItemLabel = { label: parsed.label, category: parsed.category, source: source === "in_cloud" ? "in_cloud" : "on_device" };
      set(name, label);
      done += 1;
      opts.onProgress?.({ done, total: names.length, latest: [{ name, label }], source });
    };

    try {
      if (goesToCloud) await recordCloud({ purpose: "Label items (you allowed this)", model: CLOUD_LABEL_MODEL, sent: batch.join("\n") });
      const result = await model.generateContentStream(prompt, { signal: opts.signal });
      let buffer = "";
      for await (const chunk of result.stream) {
        if (chunk.inferenceSource === "in_cloud") source = "in_cloud";
        buffer += chunk.text();
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          take(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }
      take(buffer);
      if (source === "on_device") await recordOnDevice();
    } catch (err) {
      if (!opts.signal?.aborted) console.warn("Receipts: labelling batch failed, using local rules for the rest of it", err);
    }

    // Anything the model skipped in this batch gets a local label, so the year stays complete.
    const missed = batch.filter((_, j) => !labelled.has(j + 1));
    if (missed.length) {
      const latest = missed.map((name) => {
        const label = ruleLabel(name);
        set(name, label);
        return { name, label };
      });
      done += missed.length;
      opts.onProgress?.({ done, total: names.length, latest, source: "rules" });
    }
    await saveCache(cache);
  }
  for (const name of todo) if (!out.has(normalizeName(name))) set(name, ruleLabel(name));
  return out;
}

export { ruleLabel };
