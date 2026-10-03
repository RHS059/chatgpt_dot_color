# ChatGPT Dot Color

Fixing accessibility: a small Firefox extension that gives **your outgoing ChatGPT bubbles** a background color you choose, then uses whichever of black or white has the higher WCAG 2.2 contrast ratio.

## Use it

1. Download the `chatgpt-dot-color-firefox-unsigned` artifact from a successful **Firefox extension** run in [GitHub Actions](https://github.com/RHS059/chatgpt_dot_color/actions). Extract the artifact wrapper to get the extension's inner `.zip` and `SHA256SUMS.txt`.
2. In Firefox **140 or newer**, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the inner extension `.zip`. Alternatively, clone this repository and select `extension/manifest.json`.
3. Reload ChatGPT tabs that were already open once. New tabs load the extension automatically. Firefox must allow the extension to run on `chatgpt.com`.
4. Open the **Dot Color** toolbar popup. Use the color picker or type `#RGB` / `#RRGGBB`. The preview shows the chosen text color, contrast ratio, and AA/AAA level. Click **Apply color** to save and update loaded ChatGPT tabs.
5. **Reset to default** removes the saved override and restores ChatGPT's own theme. Changing the preview alone does not change the site.

**The build is unsigned.** Temporary add-ons are removed when Firefox restarts. A ZIP renamed to XPI is still unsigned and cannot be installed normally in release Firefox. A persistent release installation requires Mozilla signing, including for private/unlisted distribution. This repository does not publish to AMO, create signing credentials, or disable Firefox's signature checks. Local extension storage normally survives browser restarts; an unsigned temporary extension must be loaded again after restarting. Removing an add-on may clear its saved preference.

Mozilla: [temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) · [signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

## Exactly what changes

The target supplied for this project is:

```css
:where(.messaging-root) .message-row.self:not(.assistant) .message-bubble
```

The extension adds a root enable marker, then changes only those bubbles' background and foreground. It also overrides their `--messaging-outgoing-background` and `--messaging-outgoing-foreground` custom properties. The background shorthand clears native gradients so contrast is calculated against the actual opaque chosen color.

Firefox injects `content.css` at **user origin** with `!important`; this outranks ChatGPT's author styles, including inline variables and layered `!important` rules. Extension-prefixed variables contain validated hex values. The malformed `var()` fallbacks in the original example are not reused. Reset removes only the extension's root marker/variables, so the site's original styles take effect again.

New bubbles and single-page navigation match the stylesheet automatically, without observing or scanning message content. `storage.onChanged` updates existing loaded tabs; new page loads restore the setting. A revision guard prevents an older initial read from undoing a newer save/reset. Back/forward-cache restoration refreshes the saved setting too.

Ordinary text inherits the bubble foreground. Independently styled code blocks, attachments, images, buttons, and other child components are not forcibly recolored. This avoids making their text unreadable against their own backgrounds. The contrast result applies to the selected opaque background and black/white text, not a guarantee that every part of ChatGPT meets WCAG. OS forced-color modes, other user stylesheets, opacity, or future site changes may affect the rendered result.

This targets the `.messaging-root` / `.message-row.self` dot messaging interface. Other ChatGPT layouts with different markup are intentionally untouched. The extension will need an update if those classes change. It affects the Firefox website, not native desktop/mobile apps.

## Contrast calculation

Each 8-bit sRGB channel is divided by 255, then linearized with the WCAG 2.2 threshold `0.04045`:

```text
linear(c) = c / 12.92                         if c <= 0.04045
            ((c + 0.055) / 1.055) ^ 2.4     otherwise
L = 0.2126 * R + 0.7152 * G + 0.0722 * B
black contrast = (L + 0.05) / 0.05
white contrast = 1.05 / (L + 0.05)
```

The higher ratio wins, with black chosen for an exact tie. No HSL/brightness shortcut or rounded value is used for the decision. For an opaque sRGB background, the higher of these two ratios is always at least `sqrt(21) ≈ 4.5826:1`, meeting the 4.5:1 AA requirement for normal text. AAA (7:1) is shown only when the unrounded ratio reaches 7. Alpha colors are deliberately rejected.

Reference: [W3C WCAG 2.2 contrast and relative luminance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Privacy and permissions

- `storage`: saves one normalized color in `browser.storage.local`, only on this device/profile. Reset removes it.
- Content scripts run only on `https://chatgpt.com/*`, in the top-level page.
- No telemetry, analytics, remote code, network requests, message-content collection, accounts, sync, or background service.
- No access to other websites and no broad `tabs`, `activeTab`, or `scripting` permission.
- The manifest declares no data collection, includes a stable Gecko ID, and uses Firefox's [user-origin content CSS](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts).

## Development and packaging

Node.js 24+ is used for tooling only. The installed extension has no runtime dependencies or build transforms.

```sh
npm ci
npm run check
```

`check` runs JavaScript syntax checks, Mozilla `web-ext lint --warnings-as-errors`, Node tests, and `web-ext build`. The package contains only `extension/`, with `manifest.json` at its root. Build output is in `dist/`. GitHub Actions runs these checks and uploads an unsigned ZIP with its SHA-256 checksum.

Tests cover WCAG reference colors, sRGB threshold edges, the black/white crossover, all 256 grays, a 4,096-color RGB grid, validation, exact selector exclusions, SPA additions, persistence, live storage updates, initial-read races, reset, popup previews, repeated input, and storage errors. DOM tests use jsdom and mocked WebExtension storage. They do **not** replace an actual Firefox/live-site smoke test or simulate Gecko's user-origin CSS cascade.

Before signing or releasing, load it in Firefox and check: light/dark themes; existing and new outgoing messages; unchanged assistant messages; native inline/layered styles; typing invalid colors; reset; reopening the popup; multiple ChatGPT tabs; SPA and back/forward navigation; refresh and signed-extension restart persistence; keyboard navigation; and Firefox site-access permissions. This initial build has not been signed or published to AMO.
