"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { JSDOM } = require("jsdom");
const source = (file) => readFileSync(`extension/${file}`, "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const enabled = "data-chatgpt-dot-color-enabled";
const bg = "--chatgpt-dot-color-background";
const fg = "--chatgpt-dot-color-foreground";
const target = ":where(.messaging-root) .message-row.self:not(.assistant) .message-bubble";

function setup(html = "<!doctype html><html><body></body></html>", initial = {}, getOverride) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://chatgpt.com/" });
  const listeners = [];
  const calls = [];
  const stored = { ...initial };
  const emit = (changes, area = "local") => listeners.forEach((listener) => listener(changes, area));
  const storage = {
    get: getOverride || (async () => ({ ...stored })),
    set: async (values) => {
      calls.push(["set", values]);
      for (const [key, value] of Object.entries(values)) {
        const oldValue = stored[key];
        stored[key] = value;
        emit({ [key]: { oldValue, newValue: value } });
      }
    },
    remove: async (key) => {
      calls.push(["remove", key]);
      const oldValue = stored[key];
      delete stored[key];
      emit({ [key]: { oldValue } });
    }
  };
  dom.window.browser = { storage: { local: storage, onChanged: { addListener: (fn) => listeners.push(fn) } } };
  dom.window.eval(source("color.js"));
  return { dom, window: dom.window, document: dom.window.document, storage, stored, emit, calls };
}

async function content(initial = {}, getOverride, html) {
  const env = setup(html, initial, getOverride);
  env.window.eval(source("content.js"));
  await tick();
  return env;
}

test("default does not activate an override", async (t) => {
  const env = await content();
  t.after(() => env.window.close());
  assert.equal(env.document.documentElement.hasAttribute(enabled), false);
  assert.equal(env.document.documentElement.style.getPropertyValue(bg), "");
});

test("saved setting is restored and changed live without reading message content", async (t) => {
  const env = await content({ backgroundColor: "#000" });
  t.after(() => env.window.close());
  const root = env.document.documentElement;
  assert.ok(root.hasAttribute(enabled));
  assert.equal(root.style.getPropertyValue(bg), "#000000");
  assert.equal(root.style.getPropertyValue(fg), "#ffffff");
  env.emit({ backgroundColor: { newValue: "#ffffff" } });
  assert.equal(root.style.getPropertyValue(fg), "#000000");
  assert.equal(root.style.getPropertyPriority(bg), "important");
});

test("reset removes only our marker/properties and leaves native styles intact", async (t) => {
  const env = await content({ backgroundColor: "#123456" }, undefined,
    '<!doctype html><html style="--messaging-outgoing-background: pink; --other: 1" data-site="yes"><body><div style="color: red">Keep me</div></body></html>');
  t.after(() => env.window.close());
  env.emit({ backgroundColor: { oldValue: "#123456" } });
  const root = env.document.documentElement;
  assert.equal(root.hasAttribute(enabled), false);
  assert.equal(root.style.getPropertyValue(bg), "");
  assert.equal(root.style.getPropertyValue(fg), "");
  assert.equal(root.style.getPropertyValue("--messaging-outgoing-background"), "pink");
  assert.equal(root.dataset.site, "yes");
  assert.equal(env.document.querySelector("div").getAttribute("style"), "color: red");
});

test("invalid storage is disabled and unrelated changes are ignored", async (t) => {
  const env = await content({ backgroundColor: "#fff; background: url(evil)" });
  t.after(() => env.window.close());
  const root = env.document.documentElement;
  assert.equal(root.hasAttribute(enabled), false);
  env.emit({ backgroundColor: { newValue: "#fff" } }, "sync");
  env.emit({ someOtherSetting: { newValue: "#fff" } });
  assert.equal(root.hasAttribute(enabled), false);
  env.emit({ backgroundColor: { newValue: "#f00" } });
  assert.ok(root.hasAttribute(enabled));
  env.emit({ backgroundColor: { newValue: "bad" } });
  assert.equal(root.hasAttribute(enabled), false);
});

test("a stale initial read cannot overwrite a newer change or reset", async (t) => {
  for (const change of [{ newValue: "#fff" }, {}]) {
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    const env = await content({}, () => pending);
    t.after(() => env.window.close());
    env.emit({ backgroundColor: change });
    resolve({ backgroundColor: "#000" });
    await tick();
    assert.equal(env.document.documentElement.style.getPropertyValue(bg), change.newValue ? "#ffffff" : "");
  }
});

test("storage failure starts safely with no override", async (t) => {
  const env = await content({}, async () => { throw new Error("unavailable"); });
  t.after(() => env.window.close());
  assert.equal(env.document.documentElement.hasAttribute(enabled), false);
});

test("back/forward cache restore re-reads the persisted color", async (t) => {
  const env = await content({ backgroundColor: "#000" });
  t.after(() => env.window.close());
  env.stored.backgroundColor = "#fff";
  env.window.dispatchEvent(new env.window.PageTransitionEvent("pageshow", { persisted: true }));
  await tick();
  assert.equal(env.document.documentElement.style.getPropertyValue(bg), "#ffffff");
});

test("exact bubble selector matches new SPA bubbles but excludes assistants/outside content", async (t) => {
  const env = await content({ backgroundColor: "#f00" }, undefined, `<!doctype html><html><body>
    <div class="messaging-root"><div class="message-row self"><div class="message-bubble" id="human">Human</div></div>
    <div class="message-row self assistant"><div class="message-bubble" id="assistant-self">Assistant</div></div>
    <div class="message-row assistant"><div class="message-bubble">Assistant</div></div></div>
    <div class="message-row self"><div class="message-bubble">Outside</div></div></body></html>`);
  t.after(() => env.window.close());
  assert.deepEqual([...env.document.querySelectorAll(target)].map((node) => node.id), ["human"]);
  env.document.querySelector(".messaging-root").insertAdjacentHTML("beforeend", '<div class="message-row self"><div class="message-bubble" id="new">New</div></div>');
  const cssSelector = source("content.css").replace(/\/\*[\s\S]*?\*\//g, "").split("{")[0].trim();
  assert.equal(cssSelector, `:root[${enabled}] ${target}`);
  assert.deepEqual([...env.document.querySelectorAll(cssSelector)].map((node) => node.id), ["human", "new"]);
  env.emit({ backgroundColor: {} });
  assert.equal(env.document.querySelectorAll(cssSelector).length, 0);
});

async function popup(initial, getOverride) {
  const env = setup(source("popup.html"), initial, getOverride);
  env.window.eval(source("popup.js"));
  await tick();
  return env;
}
function input(env, id, value) {
  const element = env.document.getElementById(id);
  element.value = value;
  element.dispatchEvent(new env.window.Event("input", { bubbles: true }));
}
function submit(env) {
  env.document.getElementById("color-form").dispatchEvent(new env.window.Event("submit", { bubbles: true, cancelable: true }));
}

test("popup previews immediately, saves normalized color only on Apply, and restores on reopen", async (t) => {
  const env = await popup({});
  t.after(() => env.window.close());
  input(env, "color-picker", "#ffffff");
  assert.equal(env.document.getElementById("hex-color").value, "#ffffff");
  assert.match(env.document.getElementById("contrast-details").textContent, /Black text · 21.00:1 · AAA/);
  assert.equal(env.calls.length, 0);
  input(env, "hex-color", "#AbC");
  submit(env);
  await tick();
  assert.equal(env.stored.backgroundColor, "#aabbcc");
  const reopened = await popup(env.stored);
  t.after(() => reopened.window.close());
  assert.equal(reopened.document.getElementById("hex-color").value, "#aabbcc");
});

test("popup rejects invalid hex without persisting it", async (t) => {
  const env = await popup({});
  t.after(() => env.window.close());
  input(env, "hex-color", "#xyzxyz");
  submit(env);
  await tick();
  assert.equal(env.calls.length, 0);
  assert.equal(env.document.getElementById("hex-color").getAttribute("aria-invalid"), "true");
});

test("reset discards preview edits and removes saved preference without delayed writes", async (t) => {
  const env = await popup({ backgroundColor: "#000000" });
  t.after(() => env.window.close());
  input(env, "hex-color", "#fff");
  env.document.getElementById("reset").click();
  await tick();
  assert.equal(env.stored.backgroundColor, undefined);
  assert.deepEqual(env.calls.map((call) => call[0]), ["remove"]);
  assert.match(env.document.getElementById("status").textContent, /default restored/);
  await tick();
  assert.equal(env.calls.length, 1);
});

test("repeated submit/reset cannot race an outstanding save", async (t) => {
  const env = await popup({});
  t.after(() => env.window.close());
  let resolve;
  let writes = 0;
  env.storage.set = () => { writes += 1; return new Promise((done) => { resolve = done; }); };
  submit(env);
  submit(env);
  env.document.getElementById("reset").click();
  assert.equal(writes, 1);
  assert.equal(env.document.getElementById("controls").disabled, true);
  resolve();
  await tick();
  assert.equal(env.document.getElementById("controls").disabled, false);
});

test("write failures are shown and controls recover for retry", async (t) => {
  const env = await popup({ backgroundColor: "#000000" });
  t.after(() => env.window.close());
  env.storage.set = async () => { throw new Error("write failed"); };
  input(env, "color-picker", "#ffffff");
  submit(env);
  await tick();
  assert.equal(env.stored.backgroundColor, "#000000");
  assert.equal(env.document.getElementById("status").dataset.error, "true");
  assert.equal(env.document.getElementById("controls").disabled, false);
});

test("nested ordinary typography overrides explicit foreground/background while protected components stay excluded", async (t) => {
  const env = await content({ backgroundColor: "#000" }, undefined, `<!doctype html><html><body role="main">
    <div class="messaging-root" role="log"><div class="message-row self" role="group"><div class="message-bubble" role="group">
      <div class="prose" style="background:white"><p id="paragraph" style="color:red"><span id="span" style="color:black">Text</span><strong id="strong">Bold</strong><a id="link" href="/">Link</a></p></div>
      <pre><code><span id="code">Code</span></code></pre>
      <button><span id="button">Control</span></button>
      <div class="attachment" style="background:white;color:black"><p id="attachment">File</p></div>
      <div data-testid="message-attachment"><span id="marked-attachment">File</span></div>
      <div role="group"><span id="role-component">Component</span></div>
      <span role="button" id="role-self">Button</span>
      <div contenteditable="true"><p id="editor">Editor</p></div>
      <svg><text><tspan>SVG</tspan></text></svg>
    </div></div><div class="message-row assistant"><div class="message-bubble"><p id="assistant">Assistant</p></div></div></div>
  </body></html>`);
  t.after(() => env.window.close());
  const rules = source("content.css").replace(/\/\*[\s\S]*?\*\//g, "").split("}").filter((part) => part.trim()).map((part) => part.split("{"));
  const [selector, declarations] = rules[1];
  assert.deepEqual([...env.document.querySelectorAll(selector.trim())].map((node) => node.id), ["paragraph", "span", "strong", "link"]);
  assert.match(declarations, /background: var\(--chatgpt-dot-color-background\) !important/);
  assert.match(declarations, /color: var\(--chatgpt-dot-color-foreground\) !important/);
  assert.deepEqual([...env.document.querySelectorAll(rules[2][0].trim())].map((node) => node.id), ["link"]);
  assert.match(rules[2][1], /text-decoration-line: underline !important/);
  assert.doesNotMatch(declarations, /font|outline|border/);
  env.emit({ backgroundColor: {} });
  assert.equal(env.document.querySelectorAll(selector.trim()).length, 0);
});

test("popup initial read failure shows retry guidance and leaves controls usable", async (t) => {
  const env = await popup({}, async () => { throw new Error("unavailable"); });
  t.after(() => env.window.close());
  assert.equal(env.document.getElementById("status").dataset.error, "true");
  assert.match(env.document.getElementById("status").textContent, /reopening/);
  assert.equal(env.document.getElementById("controls").disabled, false);
  input(env, "hex-color", "#fff");
  submit(env);
  await tick();
  assert.equal(env.stored.backgroundColor, "#ffffff");
});
