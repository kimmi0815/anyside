# anyside

anyside is a Manifest V3 Chrome extension that keeps AI services in Chrome's Side Panel while you browse normally in the main tab.

It displays a local extension page in the Side Panel and loads the selected AI service inside an iframe. It never sets `side_panel.default_path` to an external URL.

## Included services

- ChatGPT: `https://chatgpt.com/`
- Gemini: `https://gemini.google.com/`
- Claude: `https://claude.ai/`
- Perplexity: `https://www.perplexity.ai/`
- NotebookLM: `https://notebooklm.google.com/`
- Grok: `https://grok.com/`
- Copilot: `https://copilot.microsoft.com/`
- DeepSeek: `https://chat.deepseek.com/`
- Kimi: `https://www.kimi.com/`
- MiniMax: `https://agent.minimax.io/`
- GLM: `https://chat.z.ai/`
- Manus: `https://manus.im/`
- Genspark: `https://www.genspark.ai/`
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

The Side Panel keeps the AI frame visually primary. The header switches quick access services, and loading, timeout, and error states use a small transient banner or fallback actions.

Quick access is managed in Options. ChatGPT, Gemini, and Claude appear in the header by default; other built-in services and custom URLs can be added or removed from the header there. HTTPS URLs can be entered with or without `https://`; local testing URLs may use `http://localhost`, `http://127.0.0.1`, or the same localhost inputs without a protocol.

The composer adds optional context tools without changing the existing one-click Context actions or Prompt palette behavior:

- Context actions still insert URL, title + URL, selected text, page context, page questions, and page summaries as before. The new body-aware actions are appended after those existing actions.
- Body-aware actions fetch active-tab page text only after the user explicitly chooses them. They include extracted body text, headings, and domain, and never change the original Summarize this page action.
- Context Shelf temporarily keeps title + URL, selected text, and extracted page body context for the current browser session. Selection text can also be added from the page context menu. Shelf items can be inserted into the current AI, sent to Draft, copied one by one or all together, removed one by one, or cleared together.
- Prompt Draft is an editable textarea for text explicitly sent there. Draft text can be inserted into the current AI, copied, cleared, or tried in another selected AI. anyside attempts insertion and falls back to copy; it never auto-submits.
- Prompt templates support `{{title}}`, `{{url}}`, `{{selection}}`, `{{date}}`, `{{service}}`, `{{draft}}`, `{{domain}}`, `{{headings}}`, and `{{pageText}}`. `{{draft}}` expands to the current Prompt Draft text. Templates that include `{{domain}}`, `{{headings}}`, or `{{pageText}}` trigger active-tab extraction only when the user selects that template.

## Developer diagnostics

Developer diagnostics are hidden from the normal Side Panel UI. Open the side panel page with `?debug=1` to test each bundled AI service with frame-header relaxation skipped and applied.

Chrome extensions cannot inspect the inside of cross-origin iframes, so diagnostics record load/timeout signals and let you manually mark whether the service was visibly usable.

Each diagnostic temporarily opens a frame compatibility session for the tested service without saving a user setting. The background worker removes the session rule afterward, when the session expires, or when the Side Panel unloads, and the Side Panel returns to what was shown before the diagnostic run.

## Iframe compatibility

Some AI sites block iframe embedding with `X-Frame-Options` or `Content-Security-Policy`. anyside uses Declarative Net Request frame compatibility rules that remove:

- `x-frame-options`
- `content-security-policy`

The allowlisted request domains are `chatgpt.com`, `gemini.google.com`, `claude.ai`, `www.perplexity.ai`, `notebooklm.google.com`, `grok.com`, `copilot.microsoft.com`, `chat.deepseek.com`, `www.kimi.com`, `agent.minimax.io`, `chat.z.ai`, `manus.im`, and `www.genspark.ai`. The packaged static ruleset at `rules/allow-framing-ai-sites.json` remains disabled; runtime compatibility uses short-lived session rules automatically while a built-in AI iframe is being loaded from the extension Side Panel.

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
- Context and Prompt actions run only after a user action, then use the active tab title, URL, selected text, and, for explicitly body-aware actions/templates only, extracted page text and headings to build the requested text.
- Context Shelf and Prompt Draft are session-only browser-side state. They are not persisted as extension settings.
- When an AI input page is connected, anyside may insert that user-requested text into the visible AI input field; otherwise it falls back to copying the text.
- It does not auto-submit prompts.
- The context menu can create a prompt and copy it to your clipboard, or add the current selection to the session-only Context Shelf, after a user action.
- The embedded iframe receives delegated `clipboard-write` permission so AI page copy buttons can work. It does not receive delegated `clipboard-read` permission. Extension-initiated clipboard writes use the extension/offscreen helper instead.

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
