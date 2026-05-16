import { Messages } from "../shared/messages.js";
import type { RuntimeMessage } from "../shared/types.js";

const MAX_CLIPBOARD_TEXT_LENGTH = 1_000_000;

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message?.type !== Messages.OFFSCREEN_COPY_TEXT || message.target !== "offscreen") {
    return false;
  }

  if (sender.id !== chrome.runtime.id || sender.tab) {
    sendResponse({ ok: false, error: "Forbidden." });
    return false;
  }

  if (typeof message.text !== "string") {
    sendResponse({ ok: false, error: "Invalid text." });
    return false;
  }

  if (message.text.length > MAX_CLIPBOARD_TEXT_LENGTH) {
    sendResponse({ ok: false, error: "Text is too large." });
    return false;
  }

  navigator.clipboard.writeText(message.text)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      const errMsg = error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: errMsg });
    });

  return true;
});
