# Chrome Web Store Checklist

Use this checklist before public release and whenever `manifest.json` changes.

## Permission Justification

- `activeTab`: Reads the currently active tab title, URL, and selection after an explicit user action for Context and Prompt actions.
- `clipboardWrite`: Copies generated prompt text to the clipboard after user action or when AI-page insertion is unavailable.
- `contextMenus`: Adds selected-text context menu actions for asking anyside about a selection or adding the selection to the session-only Context Shelf.
- `declarativeNetRequest`: Supports short-lived iframe compatibility session rules for built-in AI-service subframes.
- `declarativeNetRequestWithHostAccess`: Allows frame compatibility session rules to apply to the declared built-in AI-service hosts.
- `offscreen`: Creates the extension offscreen document used for reliable clipboard writes.
- `scripting`: Injects short user-action clipboard helpers and communicates with AI input agents on supported pages.
- `sidePanel`: Opens and manages the Chrome Side Panel experience.
- `storage`: Stores local extension settings, custom URLs, quick access visibility, service order, diagnostics, and prompt templates.
- `windows`: Creates or reuses the side-window fallback when iframe loading or login is unreliable.

The extension intentionally does not request the persistent `tabs` permission. It still uses the `chrome.tabs` API for operations allowed by `activeTab`, user gestures, or APIs that do not require the `tabs` permission.

## Host Permission Justification

- `https://chatgpt.com/*`: Loads ChatGPT in the Side Panel and supports the ChatGPT input agent and frame compatibility rule.
- `https://*.chatgpt.com/*`: Covers ChatGPT subdomains used by Chrome host matching and supported page routing.
- `https://gemini.google.com/*`: Loads Gemini in the Side Panel and supports the Gemini input agent and frame compatibility rule.
- `https://claude.ai/*`: Loads Claude in the Side Panel and supports the Claude input agent and frame compatibility rule.
- `https://*.claude.ai/*`: Covers Claude subdomains used by Chrome host matching and supported page routing.
- `https://notebooklm.google.com/*`: Loads NotebookLM in the Side Panel and supports the NotebookLM input agent and frame compatibility rule.
- `https://perplexity.ai/*`: Loads Perplexity in the Side Panel and supports Perplexity page routing.
- `https://*.perplexity.ai/*`: Covers Perplexity subdomains, including `www.perplexity.ai`, for iframe loading, input agent routing, and frame compatibility.
- `https://grok.com/*`: Loads Grok in the Side Panel and supports the Grok input agent and frame compatibility rule.
- `https://*.grok.com/*`: Covers Grok subdomains used by Chrome host matching and supported page routing.
- `https://copilot.microsoft.com/*`: Loads Copilot in the Side Panel and supports the Copilot input agent and frame compatibility rule.
- `https://chat.deepseek.com/*`: Loads DeepSeek in the Side Panel and supports the DeepSeek input agent and frame compatibility rule.
- `https://www.kimi.com/*`: Loads Kimi in the Side Panel and supports the Kimi input agent and frame compatibility rule.
- `https://*.kimi.com/*`: Covers Kimi subdomains used by Chrome host matching and supported page routing.
- `https://agent.minimax.io/*`: Loads MiniMax in the Side Panel and supports the MiniMax input agent and frame compatibility rule.
- `https://chat.z.ai/*`: Loads GLM in the Side Panel and supports the GLM input agent and frame compatibility rule.
- `https://manus.im/*`: Loads Manus in the Side Panel and supports the Manus input agent and frame compatibility rule.
- `https://*.manus.im/*`: Covers Manus subdomains used by Chrome host matching and supported page routing.
- `https://www.genspark.ai/*`: Loads Genspark in the Side Panel and supports the Genspark input agent and frame compatibility rule.
- `https://*.genspark.ai/*`: Covers Genspark subdomains used by Chrome host matching and supported page routing.

## Data Disclosure Notes

- Stored data is local Chrome extension storage: settings, custom URLs, diagnostics, service order, quick access visibility, and prompt templates. Context Shelf items, Prompt Draft text, and pending context-menu Shelf selections are session-only.
- Active tab context is temporary and requested only after user action.
- Clipboard writes are user-action driven or fallback behavior.
- Custom URL favicon discovery omits credentials for extension fetches.
- AI-service prompt insertion fills the visible AI input field and does not auto-submit.
- anyside has no backend server of its own.
- DNR iframe compatibility uses short-lived session rules and is limited to built-in AI-service subframes loaded by the extension Side Panel.
- Users can reset extension settings from Options or delete all stored extension data by uninstalling the extension.
