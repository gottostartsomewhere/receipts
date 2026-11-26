// Where a finished year is kept: the extension's own local storage (or localStorage on the
// web demo). It never leaves this browser, and "Forget this year" deletes it.

import type { ItemLabel, Order } from "./types";
import type { Wrapped } from "./wrapped";

export interface RunSource {
  kind: "shops" | "demo" | "sample";
  /** Store and catalog ids, for "Read again". */
  shops?: string[];
  /** URLs of pages added with the toolbar icon. */
  pages?: string[];
  persona?: "chennai" | "seattle";
  /** Human description, e.g. "Amazon.in, Swiggy" or "Demo store". */
  label: string;
}

export interface SavedYear {
  year: number;
  savedAt: string;
  source: RunSource;
  orders: Order[];
  /** Nano's item labels, so reopening needs no model at all. */
  labels: [string, ItemLabel][];
  wrapped?: Wrapped;
  /** Whether the Wrapped was written by the cloud (so the facts were sent). */
  sentToCloud?: boolean;
}

const KEY = "year:v1";
const SHOPS_KEY = "shops:v1";

const chromeLocal = () => (globalThis as { chrome?: { storage?: { local?: chrome.storage.StorageArea } } }).chrome?.storage?.local;

async function get<T>(key: string): Promise<T | undefined> {
  try {
    const area = chromeLocal();
    if (area) return (await area.get(key))[key] as T | undefined;
    const raw = localStorage.getItem(`receipts:${key}`);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

async function set(key: string, value: unknown): Promise<void> {
  try {
    const area = chromeLocal();
    if (area) await area.set({ [key]: value });
    else localStorage.setItem(`receipts:${key}`, JSON.stringify(value));
  } catch {
    /* storage can be unavailable (private windows); the app still works for this session */
  }
}

async function remove(key: string): Promise<void> {
  try {
    const area = chromeLocal();
    if (area) await area.remove(key);
    else localStorage.removeItem(`receipts:${key}`);
  } catch {
    /* nothing to remove */
  }
}

export const loadYear = () => get<SavedYear>(KEY);
export const saveYear = (y: SavedYear) => set(KEY, y);
export const forgetYear = () => remove(KEY);

export const loadTickedShops = async () => (await get<string[]>(SHOPS_KEY)) ?? [];
export const saveTickedShops = (ids: string[]) => set(SHOPS_KEY, ids);
