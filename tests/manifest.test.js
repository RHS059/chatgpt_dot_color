"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync, readdirSync } = require("node:fs");
const manifest = require("../extension/manifest.json");

test("manifest is Firefox MV3 with storage and only chatgpt.com content access", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.content_scripts.length, 1);
  const entry = manifest.content_scripts[0];
  assert.deepEqual(entry.matches, ["https://chatgpt.com/*"]);
  assert.equal(entry.css_origin, "user");
  assert.equal(entry.run_at, "document_start");
  assert.notEqual(entry.all_frames, true);
  assert.deepEqual(entry.js, ["color.js", "content.js"]);
  for (const file of [...entry.js, ...entry.css, manifest.action.default_popup, ...Object.values(manifest.icons)]) {
    assert.ok(existsSync(`extension/${file}`), `Missing ${file}`);
  }
  assert.ok(manifest.browser_specific_settings.gecko.id);
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ["none"]);
});

test("user-origin sheet explicitly overrides native vars and bubble paints, with no descendant rule", () => {
  const css = readFileSync("extension/content.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal((css.match(/{/g) || []).length, 1);
  assert.match(css, /--messaging-outgoing-background: var\(--chatgpt-dot-color-background\) !important/);
  assert.match(css, /--messaging-outgoing-foreground: var\(--chatgpt-dot-color-foreground\) !important/);
  assert.match(css, /\n\s*background: var\(--chatgpt-dot-color-background\) !important/);
  assert.match(css, /\n\s*color: var\(--chatgpt-dot-color-foreground\) !important/);
  // background shorthand also clears any native gradient/image.
  assert.doesNotMatch(css, /@layer|\.message-bubble\s+[*>:]|url\(/);
});

test("extension has no network code, remote scripts, sync storage, or HTML injection", () => {
  for (const file of readdirSync("extension").filter((name) => /\.(js|html|css)$/.test(name))) {
    const text = readFileSync(`extension/${file}`, "utf8");
    assert.doesNotMatch(text, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|storage\.sync|innerHTML\s*=/, file);
    assert.doesNotMatch(text, /<(?:script|link)[^>]*(?:src|href)=["']https?:/, file);
  }
});
