/* Shared by the popup and the isolated content-script world. No page data is read. */
(() => {
  "use strict";

  const STORAGE_KEY = "backgroundColor";
  const DEFAULT_PREVIEW = "#4f46e5";

  function normalizeHex(value) {
    if (typeof value !== "string") return null;
    const hex = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      return "#" + [...hex.slice(1)].map((digit) => digit + digit).join("").toLowerCase();
    }
    return null;
  }

  // WCAG 2.2 relative luminance uses this sRGB transfer function (not HSL lightness).
  function linearizeSrgb(channel) {
    if (!Number.isFinite(channel) || channel < 0 || channel > 1) {
      throw new RangeError("Expected an sRGB channel between 0 and 1.");
    }
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }

  function contrastForBackground(value) {
    const background = normalizeHex(value);
    if (!background) throw new TypeError("Expected an opaque #RGB or #RRGGBB color.");
    const [red, green, blue] = [1, 3, 5].map((index) =>
      linearizeSrgb(parseInt(background.slice(index, index + 2), 16) / 255));
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const blackContrast = (luminance + 0.05) / 0.05;
    const whiteContrast = 1.05 / (luminance + 0.05);
    const foreground = blackContrast >= whiteContrast ? "#000000" : "#ffffff";
    return Object.freeze({
      background, foreground, luminance, blackContrast, whiteContrast,
      ratio: Math.max(blackContrast, whiteContrast)
    });
  }

  const api = Object.freeze({ STORAGE_KEY, DEFAULT_PREVIEW, normalizeHex, linearizeSrgb, contrastForBackground });
  globalThis.ChatGPTDotColor = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})();
