# anyside

anyside is a Manifest V3 Chrome extension that keeps AI services in Chrome's Side Panel while you browse normally in the main tab.

It displays a local extension page in the Side Panel and loads the selected AI service inside an iframe. It never sets `side_panel.default_path` to an external URL.

## Included services

- ChatGPT: `https://chatgpt.com/`
- Claude: `https://claude.ai/`
- Gemini: `https://gemini.google.com/`
- Perplexity: `https://www.perplexity.ai/`
- NotebookLM: `https://notebooklm.google.com/`
- Custom URL

## Build

Use Node.js 20.19 or newer. Install dependencies, typecheck, and build the extension JavaScript into `dist/`:

```sh
npm install
npm run typecheck
npm run build
```

Run the automated checks:

```sh
npm run test
```

For local development without invoking the TypeScript compiler output pipeline directly, the fallback build helper strips TypeScript into `dist/`:

```sh
npm run build:local
```

To create a Chrome extension zip from only the files needed at runtime:

```sh
npm run release:zip
```

## Load as an unpacked extension

1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
5. Click the anyside extension icon, or press `Command+Shift+Y` on macOS / `Ctrl+Shift+Y` elsewhere.

## Side Panel UI

The Side Panel keeps the AI frame visually primary. The header switches services, and loading, timeout, and error states use a small transient banner or fallback actions.

Custom URLs are managed in Options. HTTPS URLs can be entered with or without `https://`; local testing URLs may use `http://localhost`, `http://127.0.0.1`, or the same localhost inputs without a protocol.

## Developer diagnostics

Developer diagnostics are hidden from the normal Side Panel UI. Open the side panel page with `?debug=1` to test each bundled AI service with frame-header relaxation skipped and applied.

Chrome extensions cannot inspect the inside of cross-origin iframes, so diagnostics record load/timeout signals and let you manually mark whether the service was visibly usable.

Each diagnostic temporarily opens a frame compatibility session for the tested service without saving a user setting. The background worker removes the session rule afterward, when the session expires, or when the Side Panel unloads, and the Side Panel returns to what was shown before the diagnostic run.

## Iframe compatibility

Some AI sites block iframe embedding with `X-Frame-Options` or `Content-Security-Policy`. anyside uses Declarative Net Request frame compatibility rules that remove:

- `x-frame-options`
- `content-security-policy`

The allowlisted request domains are `chatgpt.com`, `claude.ai`, `gemini.google.com`, `www.perplexity.ai`, and `notebooklm.google.com`. The packaged static ruleset at `rules/allow-framing-ai-sites.json` remains disabled; runtime compatibility uses short-lived session rules automatically while a built-in AI iframe is being loaded from the extension Side Panel.

This compatibility behavior is intentionally limited:

- It only applies to the allowlisted built-in AI domains.
- It only applies to `sub_frame` requests.
- It does not apply to all URLs.
- It does not apply to `main_frame` browsing.
- It is not applied to arbitrary Custom URL domains.
- It is removed on service switch, reload, Side Panel unload, diagnostic completion, or session timeout.

There is no user-facing compatibility toggle. If Chrome rejects the scoped session rule, anyside fails closed instead of enabling the broad static ruleset.

## Login guidance

AI services may still fail inside an iframe because of login, third-party cookie, storage, or service-specific restrictions. If an AI site appears blank or cannot log in, first log in from a normal Chrome tab, then reload the Side Panel.

## Fallback window mode

If an iframe does not load or login is unreliable, use Open in side window. anyside creates or reuses a normal Chrome window on the right side and loads the selected AI service there. This usually behaves more like a normal browser session than an embedded iframe.

## Privacy and safety

For the public privacy summary, see [`PRIVACY.md`](PRIVACY.md). For release permission and Chrome Web Store disclosure checks, see [`docs/chrome-web-store-checklist.md`](docs/chrome-web-store-checklist.md).

- anyside does not send browsing content to any external server of its own.
- Context and Prompt actions run only after a user action, then use the active tab title, URL, and selected text to build the requested text.
- When an AI input page is connected, anyside may insert that user-requested text into the visible AI input field; otherwise it falls back to copying the text.
- It does not auto-submit prompts.
- The context menu only creates a prompt and copies it to your clipboard after a user action.
- The embedded iframe does not receive delegated `clipboard-read` or `clipboard-write` permissions from anyside. Extension-initiated clipboard writes use the extension/offscreen helper instead.

## Files

- `manifest.json`
- `src/background/service-worker.ts`
- `src/sidepanel/index.html`
- `src/sidepanel/main.ts`
- `src/sidepanel/sidepanel.css`
- `src/options/index.html`
- `src/options/main.ts`
- `src/options/options.css`
- `src/offscreen/clipboard.html`
- `src/offscreen/clipboard.ts`
- `src/shared/*.ts`
- `rules/allow-framing-ai-sites.json`
