// Clicking the toolbar icon opens the Receipts page (or focuses it if already open).
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("app.html");
  const [existing] = await chrome.tabs.query({ url });
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url });
});
