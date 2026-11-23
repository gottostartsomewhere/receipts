// Store readers run inside the store's own page, in a background tab the extension opens and
// closes. That way the store's sign-in applies, and pages that only render in a browser
// (Amazon decrypts order contents client-side) are read exactly as the person would see them.

export class NotSignedIn extends Error {
  constructor(store: string) {
    super(`Not signed in to ${store}`);
    this.name = "NotSignedIn";
  }
}

export async function openBackgroundTab(url: string): Promise<number> {
  const tab = await chrome.tabs.create({ url, active: false });
  if (tab.id === undefined) throw new Error("Could not open a tab");
  await waitForLoad(tab.id);
  return tab.id;
}

export async function navigateTab(tabId: number, url: string): Promise<void> {
  await chrome.tabs.update(tabId, { url });
  await waitForLoad(tabId);
}

function waitForLoad(tabId: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("The store page took too long to load"));
    }, timeoutMs);
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === "complete") listener(tabId, { status: "complete" });
    }, reject);
  });
}

/** Runs a self-contained function inside the store page and returns its result. */
export async function runInTab<A extends unknown[], R>(tabId: number, func: (...args: A) => R | Promise<R>, args: A): Promise<R> {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res?.result as R;
}

export async function closeTab(tabId: number) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* already closed */
  }
}
