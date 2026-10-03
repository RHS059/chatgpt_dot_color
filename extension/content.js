(() => {
  "use strict";
  const { STORAGE_KEY, normalizeHex, contrastForBackground } = globalThis.ChatGPTDotColor;
  const ENABLED = "data-chatgpt-dot-color-enabled";
  const BACKGROUND = "--chatgpt-dot-color-background";
  const FOREGROUND = "--chatgpt-dot-color-foreground";
  let revision = 0;
  let currentColor = null;

  function render() {
    const root = document.documentElement;
    if (!root) return;
    if (!currentColor) {
      root.removeAttribute(ENABLED);
      root.style.removeProperty(BACKGROUND);
      root.style.removeProperty(FOREGROUND);
      return;
    }
    const { background, foreground } = contrastForBackground(currentColor);
    root.style.setProperty(BACKGROUND, background, "important");
    root.style.setProperty(FOREGROUND, foreground, "important");
    root.setAttribute(ENABLED, "");
  }

  function apply(value) {
    currentColor = normalizeHex(value);
    render();
  }

  // Register before reading, so an older asynchronous snapshot cannot undo a save/reset.
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !Object.hasOwn(changes, STORAGE_KEY)) return;
    revision += 1;
    apply(changes[STORAGE_KEY].newValue);
  });

  const initialRevision = revision;
  browser.storage.local.get(STORAGE_KEY).then((stored) => {
    if (revision === initialRevision) apply(stored[STORAGE_KEY]);
  }).catch(() => {
    if (revision === initialRevision) apply(null);
  });

  // document_start may run before <html>; no DOM-wide mutation observer is needed.
  document.addEventListener("DOMContentLoaded", render, { once: true });
  // Re-read when restoring a frozen back/forward-cache document.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    const capturedRevision = revision;
    browser.storage.local.get(STORAGE_KEY).then((stored) => {
      if (revision === capturedRevision) apply(stored[STORAGE_KEY]);
    }).catch(() => { /* Keep the last known setting if storage is unavailable. */ });
  });
})();
