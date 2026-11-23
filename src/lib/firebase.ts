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
import { CATEGORIES } from "./types";

declare global {
  // Read by the App Check SDK before initialisation.
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

const env = import.meta.env;

export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_APP_ID);

/** Cloud model for the creative work on the summary. */
export const CLOUD_MODEL = env.VITE_CLOUD_MODEL || "gemini-3.8-flash";
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

export const LABEL_SYSTEM_PROMPT =
  "You label online shopping items. For each numbered item return its id, a short everyday label of 1-3 lowercase words " +
  '(for example "biryani", "wireless mouse", "running shoes", "face serum") and one category. ' +
  "Restaurant dishes are food_delivery. Packaged food bought from a shop is groceries or snacks.";

/** JSON schema for Chrome's Prompt API responseConstraint. */
const LABEL_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          label: { type: "string" },
          category: { type: "string", enum: [...CATEGORIES] },
        },
        required: ["id", "label", "category"],
      },
    },
  },
  required: ["items"],
};

const LABEL_CLOUD_SCHEMA = Schema.object({
  properties: {
    items: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.integer(),
          label: Schema.string(),
          category: Schema.enumString({ enum: [...CATEGORIES] }),
        },
      }),
    }),
  },
});

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
      promptOptions: { responseConstraint: LABEL_JSON_SCHEMA },
    },
    inCloudParams: {
      model: CLOUD_LABEL_MODEL,
      systemInstruction: LABEL_SYSTEM_PROMPT,
      generationConfig: { responseMimeType: "application/json", responseSchema: LABEL_CLOUD_SCHEMA, temperature: 0 },
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

export function wrapModel(): GenerativeModel {
  const { ai } = getFirebase();
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      systemInstruction: WRAP_SYSTEM_PROMPT,
      generationConfig: { responseMimeType: "application/json", responseSchema: WRAP_SCHEMA, temperature: 1 },
    },
  });
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
