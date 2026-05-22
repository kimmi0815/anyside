# Privacy

anyside is a local Chrome extension. It has no backend server of its own and does not send browsing content to an anyside-operated service.

## Stored Data

anyside stores settings in local Chrome extension storage, including the selected service, custom URLs, quick access visibility, service order, diagnostic status, and custom prompt templates. Custom URL entries can include a discovered icon URL and the time it was refreshed.

Use Reset settings in Options to return extension settings to defaults. You can also remove all stored extension data by uninstalling the extension from Chrome.

## Temporary Active Tab Context

Context and Prompt actions can use the current active tab title, URL, selected text, and a timestamp. Explicitly body-aware actions and prompt templates can also extract page headings and page text after the user selects that action or template. This context is used to build the requested prompt text and is not stored as browsing history by anyside.

## Clipboard Writes

anyside writes prompt text to the clipboard only after a user action or as a fallback when direct AI-page insertion is unavailable. The embedded AI iframe receives delegated `clipboard-write` permission so AI-page copy buttons can work. `clipboard-read` is not delegated.

## Custom URL Favicon Discovery

When you save a custom URL, anyside may request the page and related icon candidates to discover a favicon. These requests use `credentials: "omit"` where the extension fetches the page or manifest, so cookies and HTTP credentials are not intentionally included by anyside.

## AI-Service Prompt Insertion

For supported AI services, anyside may insert user-requested prompt text into the visible AI input field. It does not auto-submit prompts. If a target AI page is unavailable or ambiguous, anyside falls back to copying the text.

The AI service you choose may process the text you paste or submit according to that service's own terms and privacy policy.

## Iframe Compatibility

For allowlisted built-in AI services, anyside may use short-lived Declarative Net Request session rules while loading that service inside the extension Side Panel. These scoped session rules remove `X-Frame-Options` and `Content-Security-Policy` response headers only for built-in AI-service iframe requests. The packaged static ruleset remains disabled, the rules do not apply to main-frame browsing, and compatibility is not applied to arbitrary Custom URL domains.
