"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeHex, linearizeSrgb, contrastForBackground } = require("../extension/color.js");

function near(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}

test("normalizes opaque RGB without accepting alpha, CSS, or injected declarations", () => {
  assert.equal(normalizeHex(" #AbC "), "#aabbcc");
  assert.equal(normalizeHex("#AA00ff"), "#aa00ff");
  for (const value of [null, undefined, 5, {}, "", "red", "abc", "#abcd", "#11223344", "#gggggg", "#fff; color:red", "var(--x)", "rgb(1,2,3)"]) {
    assert.equal(normalizeHex(value), null);
    assert.throws(() => contrastForBackground(value), TypeError);
  }
});

test("uses the WCAG 2.2 transfer function at, below, and above 0.04045", () => {
  near(linearizeSrgb(0), 0);
  near(linearizeSrgb(1), 1);
  near(linearizeSrgb(0.04044), 0.04044 / 12.92);
  near(linearizeSrgb(0.04045), 0.04045 / 12.92);
  near(linearizeSrgb(0.04046), ((0.04046 + 0.055) / 1.055) ** 2.4);
  near(linearizeSrgb(10 / 255), (10 / 255) / 12.92);
  near(linearizeSrgb(11 / 255), ((11 / 255 + 0.055) / 1.055) ** 2.4);
  for (const value of [-1, 1.01, NaN, Infinity, "0.5"]) assert.throws(() => linearizeSrgb(value), RangeError);
});

test("known luminance and contrast reference values", () => {
  for (const [color, luminance, foreground] of [
    ["#000000", 0, "#ffffff"], ["#ffffff", 1, "#000000"],
    ["#ff0000", 0.2126, "#000000"], ["#00ff00", 0.7152, "#000000"],
    ["#0000ff", 0.0722, "#ffffff"], ["#ffff00", 0.9278, "#000000"]
  ]) {
    const actual = contrastForBackground(color);
    near(actual.luminance, luminance);
    assert.equal(actual.foreground, foreground);
    near(actual.ratio, Math.max((luminance + 0.05) / 0.05, 1.05 / (luminance + 0.05)));
  }
  near(contrastForBackground("#000000").ratio, 21);
  near(contrastForBackground("#ffffff").ratio, 21);
});

test("chooses the actual maximum near the black/white crossover", () => {
  assert.equal(contrastForBackground("#757575").foreground, "#ffffff");
  assert.equal(contrastForBackground("#767676").foreground, "#000000");
  assert.equal(contrastForBackground("#777777").foreground, "#000000");
  const crossoverLuminance = Math.sqrt(0.0525) - 0.05;
  near((crossoverLuminance + 0.05) / 0.05, 1.05 / (crossoverLuminance + 0.05));
  assert.ok(Math.sqrt(21) > 4.5); // Worst possible higher-of-two ratio.
});

test("all 256 grays and a 4096-color RGB grid choose the maximum and meet 4.5:1", () => {
  const colors = Array.from({ length: 256 }, (_, n) => "#" + n.toString(16).padStart(2, "0").repeat(3));
  for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
    colors.push("#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join(""));
  }
  for (const color of colors) {
    const result = contrastForBackground(color);
    assert.equal(result.ratio, Math.max(result.blackContrast, result.whiteContrast));
    assert.equal(result.foreground, result.blackContrast >= result.whiteContrast ? "#000000" : "#ffffff");
    assert.ok(result.ratio >= Math.sqrt(21) - 1e-12);
  }
});
