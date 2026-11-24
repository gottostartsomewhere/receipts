import { addPage, grabPageText, looksLikeOrders } from "./lib/stores/pages";

// Clicking the toolbar icon on a shop's order page adds that page (read with Chrome's one-time
// activeTab access, no broad permissions), then opens the Receipts page.
chrome.action.onClicked.addListener(async (tab) => {
  const appUrl = chrome.runtime.getURL("app.html");
  if (tab.id !== undefined && tab.url && /^https?:\/\//.test(tab.url)) {
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: grabPageText });
      const got = res?.result as { title: string; text: string } | undefined;
      if (got?.text?.trim() && looksLikeOrders(got.text, tab.url)) {
        await addPage({ url: tab.url, host: new URL(tab.url).host.replace(/^www\./, ""), title: got.title, text: got.text, at: Date.now() });
      }
    } catch {
      // Some pages (the Chrome Web Store, PDFs) cannot be read by any extension. Just open Receipts.
    }
  }
  const [existing] = await chrome.tabs.query({ url: appUrl });
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: appUrl });
});
