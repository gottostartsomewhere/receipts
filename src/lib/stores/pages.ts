// Pages the person added by clicking the Receipts icon on a shop's order page. The text is
// kept in chrome.storage.session: memory only, gone when the browser closes, never uploaded.

export interface PageGrab {
  url: string;
  host: string;
  title: string;
  text: string;
  at: number;
}

const KEY = "pages:v1";
const MAX_PAGES = 12;

export async function getPages(): Promise<PageGrab[]> {
  try {
    const got = await chrome.storage.session.get(KEY);
    return (got[KEY] as PageGrab[] | undefined) ?? [];
  } catch {
    return [];
  }
}

export async function addPage(page: PageGrab): Promise<void> {
  const pages = (await getPages()).filter((p) => p.url !== page.url);
  pages.unshift(page);
  await chrome.storage.session.set({ [KEY]: pages.slice(0, MAX_PAGES) });
}

export async function removePage(url: string): Promise<void> {
  const pages = (await getPages()).filter((p) => p.url !== url);
  await chrome.storage.session.set({ [KEY]: pages });
}

export function onPagesChange(fn: () => void) {
  // Absent outside the extension (for example a plain localhost preview).
  globalThis.chrome?.storage?.session?.onChanged.addListener((changes) => {
    if (KEY in changes) fn();
  });
}

/** Only keep pages that look like order history, so a stray click on a news site adds nothing. */
export function looksLikeOrders(text: string, url: string): boolean {
  const t = text.toLowerCase();
  const words = ["order", "delivered", "total", "placed", "invoice", "purchase", "receipt", "shipped", "refund"];
  const hits = words.filter((w) => t.includes(w)).length;
  return hits >= 2 || /order|purchase|history|account/i.test(url);
}

/** Runs inside the shop page at the moment of the click. Self-contained. */
export function grabPageText(): { title: string; text: string } {
  const root = (document.querySelector("main") as HTMLElement | null) ?? document.body;
  return { title: document.title, text: root.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 40_000) };
}
