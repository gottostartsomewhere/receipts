// A record of every request that left the laptop, plus a count of the on-device ones.
// Shown to the person on the "What left this device" panel. Stored only in the browser.

export interface CloudCall {
  at: string;
  purpose: string;
  model: string;
  /** Exactly what was sent, as the person would read it. */
  sent: string;
}

export interface DeviceLedger {
  onDeviceCalls: number;
  itemsReadLocally: number;
  ordersReadLocally: number;
  cloudCalls: CloudCall[];
}

const KEY = "ledger:v1";

const empty = (): DeviceLedger => ({ onDeviceCalls: 0, itemsReadLocally: 0, ordersReadLocally: 0, cloudCalls: [] });

let cache: DeviceLedger | undefined;
const listeners = new Set<(l: DeviceLedger) => void>();

async function load(): Promise<DeviceLedger> {
  if (cache) return cache;
  try {
    const got = await chrome.storage.local.get(KEY);
    cache = { ...empty(), ...(got[KEY] as Partial<DeviceLedger> | undefined) };
  } catch {
    cache = empty();
  }
  return cache;
}

async function save(next: DeviceLedger) {
  cache = next;
  listeners.forEach((fn) => fn(next));
  try {
    await chrome.storage.local.set({ [KEY]: next });
  } catch {
    // Storage can be unavailable in previews; the in-memory copy still drives the UI.
  }
}

export async function getLedger(): Promise<DeviceLedger> {
  return load();
}

export function onLedgerChange(fn: (l: DeviceLedger) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function recordOnDevice(calls = 1) {
  const l = await load();
  await save({ ...l, onDeviceCalls: l.onDeviceCalls + calls });
}

export async function recordRead(orders: number, items: number) {
  const l = await load();
  await save({ ...l, ordersReadLocally: orders, itemsReadLocally: items });
}

export async function recordCloud(call: Omit<CloudCall, "at">) {
  const l = await load();
  await save({ ...l, cloudCalls: [...l.cloudCalls, { ...call, at: new Date().toISOString() }] });
}

export async function resetLedger() {
  await save(empty());
}
