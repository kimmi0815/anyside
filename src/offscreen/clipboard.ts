import { Messages } from "../shared/messages.js";
import type { RuntimeMessage } from "../shared/types.js";

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

  navigator.clipboard.writeText(message.text)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      const errMsg = error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: errMsg });
    });

  return true;
});
