import { initializeApp, type FirebaseApp } from "firebase/app";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
  type AI,
  type GenerativeModel,
} from "firebase/ai";
import type { Category } from "./types";

declare global {
  // Read by the App Check SDK before initialisation.
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

const env = import.meta.env;

export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_APP_ID);

/** Cloud models for the creative work on the summary, tried in order if one is overloaded. */
export const CLOUD_MODELS = [...new Set([env.VITE_CLOUD_MODEL || "gemini-3.5-flash-lite", "gemini-3.8-flash"])];
/** Cloud model used only if the person opts in to cloud labelling on a machine without Nano. */
export const CLOUD_LABEL_MODEL = "gemini-3.5-flash-lite";

let app: FirebaseApp | undefined;
let ai: AI | undefined;

export function getFirebase(): { app: FirebaseApp; ai: AI } {
  if (!firebaseConfigured) {
    throw new Error("Firebase is not configured. Copy .env.example to .env and fill in your project's web config.");
  }
  if (!app || !ai) {
    app = initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    });
    // MV3 extension pages cannot load reCAPTCHA (remote scripts are forbidden), so the
    // extension build uses App Check's debug provider with a token registered in the
    // Firebase console. The hosted share page uses reCAPTCHA instead.
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN || true;
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: () => Promise.reject(new Error("Receipts uses the App Check debug provider inside the extension.")),
      }),
      isTokenAutoRefreshEnabled: true,
    });
    ai = getAI(app, { backend: new GoogleAIBackend() });
  }
  return { app, ai };
}

// ---------- Item labelling (private data: item names) ----------

// Nano runs on the laptop's CPU or GPU, and every output token costs time. So the answer is
// one short line per item ("3|face serum|beauty") with one-word categories, not JSON. On a
// 2022 i5 laptop this took labelling from ~8 s to ~1.4 s per item.

/** One-word categories the model writes, mapped to Receipts' categories. */
export const SHORT_CATEGORIES: Record<string, Category> = {
  food: "food_delivery",
  grocery: "groceries",
  snack: "snacks",
  tech: "electronics",
  fashion: "fashion",
  book: "books",
  home: "home",
  beauty: "beauty",
  travel: "travel",
  fun: "entertainment",
  stationery: "stationery",
  other: "other",
};
const SHORT = Object.keys(SHORT_CATEGORIES).join("|");

export const LABEL_BATCH = 20;

export const LABEL_SYSTEM_PROMPT =
  "Label shopping items. For each numbered item write one line: number|label|category. " +
  "The label is 1 to 3 lowercase words naming the generic thing, like biryani, wireless mouse, face serum, running shoes. " +
  `The category is one of: ${Object.keys(SHORT_CATEGORIES).join(", ")}. Restaurant dishes are food.`;

/** Grammar for Chrome's Prompt API: Nano can only produce well-formed lines. */
const LABEL_LINES = new RegExp(`^(\\d{1,2}\\|[a-z][a-z0-9 '-]{0,28}\\|(${SHORT})\\n?){1,${LABEL_BATCH}}$`);

export function parseLabelLine(line: string): { id: number; label: string; category: Category } | null {
  const m = /^\s*(\d{1,2})\s*\|\s*([^|]{1,40}?)\s*\|\s*([a-z]+)\s*$/i.exec(line);
  if (!m) return null;
  const category = SHORT_CATEGORIES[m[3].toLowerCase()];
  const label = m[2].toLowerCase().trim();
  return category && label ? { id: Number(m[1]), label: label.slice(0, 32), category } : null;
}

/**
 * Item names are private, so labelling runs ONLY_ON_DEVICE by default. If Nano is missing,
 * Receipts falls back to simple local rules unless the person explicitly allows the cloud
 * to see item names (never prices, dates or addresses).
 */
export function labelModel(allowCloud: boolean): GenerativeModel {
  const { ai } = getFirebase();
  return getGenerativeModel(ai, {
    mode: allowCloud ? InferenceMode.PREFER_ON_DEVICE : InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        initialPrompts: [{ role: "system", content: [{ type: "text", value: LABEL_SYSTEM_PROMPT }] }],
      },
      promptOptions: { responseConstraint: LABEL_LINES },
    },
    inCloudParams: {
      model: CLOUD_LABEL_MODEL,
      systemInstruction: LABEL_SYSTEM_PROMPT,
      generationConfig: { responseMimeType: "text/plain", temperature: 0, maxOutputTokens: 800 },
    },
  });
}

// ---------- Read any store (private: the whole page) ----------

const ORDER_LINE =
  "(20\\d\\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01]))\\|\\d{1,7}(\\.\\d{1,2})?\\|(delivered|cancelled|returned)\\|[^|\\n]{0,40}\\|[^|\\n]{1,200}";
const ORDER_LINES = new RegExp(`^(${ORDER_LINE}\\n?){0,15}$`);

/** A whole order page is about as private as it gets, so this is ONLY_ON_DEVICE with no fallback. */
export function extractModel(year: number): GenerativeModel {
  const { ai } = getFirebase();
  const system =
    "You read text copied from an online shop's order history page. Write one line per order: date|total|status|merchant|items. " +
    `date is YYYY-MM-DD; if the page leaves out the year, it is ${year}. ` +
    "total is the amount paid for that order as a plain number, no currency sign, no commas. " +
    "status is delivered, cancelled or returned. " +
    "merchant is the restaurant or seller only if the page shows it apart from the item name; a brand is part of the item, so then leave merchant empty. " +
    "items are the item names separated by ; and shortened to at most six words each. " +
    "Only write orders that are on the page. If there are none, write nothing.";
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        initialPrompts: [{ role: "system", content: [{ type: "text", value: system }] }],
      },
      promptOptions: { responseConstraint: ORDER_LINES },
    },
  });
}

// ---------- Ask your receipts (private: the question, answered on the laptop) ----------

export const ASK_SYSTEM_PROMPT =
  "Turn a question about the person's online orders into one line: metric|item|category|merchant|month|time. " +
  "metric is spend, orders, times or biggest. item is 1 to 3 lowercase words like biryani or running shoes, or - for none. " +
  `category is one of ${Object.keys(SHORT_CATEGORIES).join(", ")}, or -. merchant is a shop or restaurant name, or -. ` +
  "month is 1 to 12, or -. time is night for late night or after 10pm, otherwise -. " +
  "Examples: how much did I spend on biryani in March -> spend|biryani|-|-|3|- . " +
  "how many times did I order from Thalappakatti -> orders|-|-|thalappakatti|-|- . " +
  "how many orders after 10pm -> orders|-|-|-|-|night . " +
  "what did food cost me after 10pm -> spend|-|food|-|-|night . " +
  "what was my biggest order in May -> biggest|-|-|-|5|- . " +
  "A time like 10pm is never a month.";

const ASK_LINE = new RegExp(
  `^(spend|orders|times|biggest)\\|([a-z0-9 '-]{1,30}|-)\\|(${SHORT}|-)\\|([a-z0-9 '&.-]{1,40}|-)\\|(1[0-2]|[1-9]|-)\\|(night|-)$`,
);

/** The question can be personal ("what did I order at 2am"), so it is answered ONLY_ON_DEVICE. */
export function askModel(): GenerativeModel {
  const { ai } = getFirebase();
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        initialPrompts: [{ role: "system", content: [{ type: "text", value: ASK_SYSTEM_PROMPT }] }],
      },
      promptOptions: { responseConstraint: ASK_LINE },
    },
  });
}

// ---------- Wrapped (only the rounded summary facts) ----------

export const WRAP_SYSTEM_PROMPT =
  "You write a funny, warm 'year in shopping' recap, like a music-app Wrapped, from a handful of facts. " +
  "Tease, never shame. No profanity. Keep every line short enough to fit on a phone story card. " +
  "Use the person's currency. Do not invent numbers that are not in the facts, except for playful comparisons " +
  "(for example what the total could have bought), which must be clearly approximate.";

const WRAP_SCHEMA = Schema.object({
  properties: {
    persona: Schema.string({ description: "A 2-5 word title for this shopper, e.g. 'The Midnight Biryani Loyalist'." }),
    cards: Schema.array({
      description: "Exactly 5 story cards in this order: total, favourite item, top category, busiest month, biggest order.",
      items: Schema.object({
        properties: {
          kicker: Schema.string({ description: "Tiny uppercase label, 1-3 words." }),
          headline: Schema.string({ description: "The big number or phrase, under 18 characters." }),
          line: Schema.string({ description: "One witty sentence, under 90 characters." }),
        },
      }),
    }),
    roast: Schema.string({ description: "Two or three sentences of affectionate roast, under 280 characters." }),
    comparison: Schema.string({ description: "What the total spend could have bought instead, under 80 characters." }),
  },
});

/** Give up on one cloud model after this long and try the next, so nobody stares at a spinner. */
export const WRAP_TIMEOUT_MS = 30_000;

export function wrapModel(model: string): GenerativeModel {
  const { ai } = getFirebase();
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model,
      systemInstruction: WRAP_SYSTEM_PROMPT,
      generationConfig: { responseMimeType: "application/json", responseSchema: WRAP_SCHEMA, temperature: 1 },
    },
  }, { timeout: WRAP_TIMEOUT_MS });
}

// ---------- Warm-up ----------

let warmSession: { destroy: () => void } | undefined;

/**
 * Loading Nano into memory takes 15-40 s on a mid-range laptop. Holding one idle session while
 * the start screen is open means the first real request (made by Firebase AI Logic) starts warm.
 * No prompt is sent here; this only asks Chrome to load the model.
 */
export async function warmNano(): Promise<void> {
  if (warmSession) return;
  const lm = (globalThis as { LanguageModel?: { create: (o?: object) => Promise<{ destroy: () => void }> } }).LanguageModel;
  if (!lm || (await nanoState()) !== "available") return;
  try {
    warmSession = await lm.create({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
  } catch {
    /* warming is best effort */
  }
}

// ---------- Nano availability (read straight from Chrome, no network) ----------

export type NanoState = "available" | "downloadable" | "downloading" | "unavailable";

export async function nanoState(): Promise<NanoState> {
  const lm = (globalThis as { LanguageModel?: { availability: (o?: object) => Promise<string> } }).LanguageModel;
  if (!lm) return "unavailable";
  try {
    const a = await lm.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
    return a === "available" || a === "downloadable" || a === "downloading" ? a : "unavailable";
  } catch {
    return "unavailable";
  }
}
