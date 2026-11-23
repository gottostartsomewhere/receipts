import { CLOUD_MODELS, firebaseConfigured, wrapModel } from "./firebase";
import { recordCloud } from "./ledger";
import { formatMoney, type CloudPayload } from "./summary";

export interface WrapCard {
  kicker: string;
  headline: string;
  line: string;
}

export interface Wrapped {
  persona: string;
  cards: WrapCard[];
  roast: string;
  comparison: string;
  source: "in_cloud" | "local";
  model?: string;
}

/** Overload and rate-limit errors are worth retrying on the next model; anything else is not. */
function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(429|500|503|504)\b|high demand|overloaded|unavailable|RESOURCE_EXHAUSTED|timed? ?out|abort/i.test(msg);
}

/** The one request that reaches the cloud: the rounded facts the person has already seen. */
export async function writeWrapped(payload: CloudPayload): Promise<Wrapped> {
  if (!firebaseConfigured) return localWrapped(payload);
  const sent = JSON.stringify(payload, null, 2);
  const prompt = `Here are the only facts you get about this person's ${payload.year} of online orders:\n${sent}`;
  let lastError: unknown;
  for (const model of CLOUD_MODELS) {
    // Logged before the call: once it is sent, it has left the laptop, whatever the server says.
    await recordCloud({ purpose: "Write your Wrapped", model, sent });
    try {
      const result = await wrapModel(model).generateContent(prompt);
      const data = JSON.parse(result.response.text()) as Omit<Wrapped, "source">;
      return { ...data, cards: (data.cards ?? []).slice(0, 5), source: "in_cloud", model };
    } catch (err) {
      lastError = err;
      console.warn(`Receipts: ${model} failed`, err);
      if (!isRetryable(err)) break;
    }
  }
  throw lastError;
}

/** Used when the person keeps everything local. Plain, but nothing leaves the laptop. */
export function localWrapped(p: CloudPayload): Wrapped {
  const m = (n: number) => formatMoney(n, p.currency);
  return {
    persona: `The ${p.favourite_item} regular`,
    cards: [
      { kicker: "THIS YEAR", headline: m(p.total_spend_rounded), line: `Across ${p.orders} orders.` },
      { kicker: "FAVOURITE", headline: `${p.favourite_item} ×${p.favourite_item_count}`, line: "You know what you like." },
      { kicker: "TOP CATEGORY", headline: `${p.top_category_percent}%`, line: `of it went on ${p.top_category}.` },
      { kicker: "BUSIEST MONTH", headline: p.busiest_month, line: "Something happened that month." },
      { kicker: "BIGGEST ORDER", headline: m(p.biggest_order_rounded), line: `The ${p.biggest_order_item}.` },
    ],
    roast: "Written on your laptop, so it is polite.",
    comparison: "",
    source: "local",
  };
}
