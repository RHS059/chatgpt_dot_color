(() => {
  "use strict";
  const { STORAGE_KEY, DEFAULT_PREVIEW, normalizeHex, contrastForBackground } = globalThis.ChatGPTDotColor;
  const form = document.getElementById("color-form");
  const controls = document.getElementById("controls");
  const picker = document.getElementById("color-picker");
  const hex = document.getElementById("hex-color");
  const preview = document.getElementById("bubble-preview");
  const details = document.getElementById("contrast-details");
  const status = document.getElementById("status");
  const reset = document.getElementById("reset");
  let busy = true;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.dataset.error = String(isError);
  }

  function showPreview(value) {
    const color = normalizeHex(value);
    hex.setCustomValidity(color ? "" : "Enter a color such as #abc or #12abef.");
    hex.setAttribute("aria-invalid", String(!color));
    if (!color) return false;
    const { foreground, ratio } = contrastForBackground(color);
    picker.value = color;
    preview.style.backgroundColor = color;
    preview.style.color = foreground;
    // Rounding is for display only; the decision and WCAG level use the full ratio.
    details.textContent = `${foreground === "#000000" ? "Black" : "White"} text · ${ratio.toFixed(2)}:1 · ${ratio >= 7 ? "AAA" : "AA"} normal text`;
    return true;
  }

  picker.addEventListener("input", () => {
    hex.value = picker.value;
    showPreview(picker.value);
    setStatus("Preview only. Apply color to save it.");
  });
  hex.addEventListener("input", () => {
    showPreview(hex.value);
    setStatus("Preview only. Apply color to save it.");
  });

  async function save(value) {
    // A single explicit write; disabling controls prevents an older save racing reset.
    if (busy) return;
    busy = true;
    controls.disabled = true;
    try {
      if (value === null) {
        await browser.storage.local.remove(STORAGE_KEY);
        hex.value = DEFAULT_PREVIEW;
        showPreview(DEFAULT_PREVIEW);
        setStatus("ChatGPT default restored. The preview above is not applied.");
      } else {
        await browser.storage.local.set({ [STORAGE_KEY]: value });
        hex.value = value;
        setStatus("Saved. Matching ChatGPT tabs use this color.");
      }
    } catch {
      setStatus("Could not save. Your previous setting is unchanged. Please try again.", true);
    } finally {
      busy = false;
      controls.disabled = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!showPreview(hex.value)) {
      hex.reportValidity();
      return;
    }
    void save(normalizeHex(hex.value));
  });
  reset.addEventListener("click", () => { void save(null); });

  showPreview(DEFAULT_PREVIEW);
  browser.storage.local.get(STORAGE_KEY).then((stored) => {
    const saved = normalizeHex(stored[STORAGE_KEY]);
    hex.value = saved || DEFAULT_PREVIEW;
    showPreview(hex.value);
    setStatus(saved ? "Your saved color is active." : "ChatGPT default is active. Pick a color, then apply it.");
  }).catch(() => {
    setStatus("Could not read your setting. You can retry by reopening this popup.", true);
  }).finally(() => {
    busy = false;
    controls.disabled = false;
  });
})();
