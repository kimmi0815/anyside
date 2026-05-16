import type { AIInputAdapter, AIInputInsertResult, AIService } from "../types.js";
import { findVisibleInput, insertIntoElement } from "./generic.js";

type SupportedService = Exclude<AIService, "unknown">;

const SERVICE_HOSTS: Record<SupportedService, string[]> = {
  chatgpt: ["chatgpt.com", "chat.openai.com"],
  gemini: ["gemini.google.com"],
  claude: ["claude.ai"],
  perplexity: ["perplexity.ai"],
  notebooklm: ["notebooklm.google.com"],
  grok: ["grok.com"],
  copilot: ["copilot.microsoft.com"],
  deepseek: ["deepseek.com"],
  kimi: ["kimi.com"],
  minimax: ["minimax.io"],
  glm: ["z.ai"],
  manus: ["manus.im"],
  genspark: ["genspark.ai"]
};

const SERVICE_SELECTORS: Record<SupportedService, string[]> = {
  chatgpt: [
    "#prompt-textarea",
    "[data-testid='prompt-textarea']",
    "div[contenteditable='true'][id='prompt-textarea']",
    "form [contenteditable='true']",
    "form div[role='textbox']",
    "[aria-label*='ChatGPT' i]",
    "[aria-label*='Message' i]",
    "[aria-label*='メッセージ' i]",
    "textarea[data-id='root']",
    "textarea",
    "div[role='textbox']",
    "[data-lexical-editor='true']",
    ".ProseMirror"
  ],
  claude: [
    "div[contenteditable='true'].ProseMirror",
    ".ProseMirror",
    "div[role='textbox'][contenteditable='true']",
    "[aria-label*='prompt' i]",
    "[contenteditable='true']",
    "textarea"
  ],
  gemini: [
    "rich-textarea div[contenteditable='true']",
    "div[contenteditable='true'][role='textbox']",
    "div[role='textbox']",
    ".ql-editor",
    "[data-lexical-editor='true']",
    "[contenteditable='true']",
    "textarea"
  ],
  perplexity: [
    "textarea[placeholder*='Ask' i]",
    "textarea[aria-label*='Ask' i]",
    "textarea[aria-label*='follow-up' i]",
    "div[contenteditable='true'][role='textbox']",
    "div[role='textbox'][contenteditable='true']",
    "[contenteditable='true'][data-lexical-editor='true']",
    "textarea"
  ],
  notebooklm: [
    "textarea[aria-label*='query' i]",
    "textarea[aria-label*='notebook' i]",
    "textarea[placeholder*='Ask' i]",
    "div[contenteditable='true'][role='textbox']",
    "div[role='textbox'][contenteditable='true']",
    "textarea"
  ],
  grok: [
    "textarea[placeholder*='Ask' i]",
    "textarea[aria-label*='Ask' i]",
    "textarea[placeholder*='Message' i]",
    "div[contenteditable='true'][role='textbox'][aria-label*='Ask' i]",
    "div[contenteditable='true'][role='textbox'][aria-label*='Message' i]"
  ],
  copilot: [
    "textarea[aria-label*='Ask' i]",
    "textarea[placeholder*='Ask' i]",
    "textarea[placeholder*='Message' i]",
    "div[contenteditable='true'][role='textbox'][aria-label*='Ask' i]",
    "div[contenteditable='true'][role='textbox'][aria-label*='Message' i]"
  ],
  deepseek: [
    "textarea[placeholder*='Message' i]",
    "textarea[placeholder*='Ask' i]",
    "textarea[aria-label*='Message' i]",
    "textarea[aria-label*='Ask' i]",
    "div[contenteditable='true'][role='textbox'][aria-label*='Message' i]"
  ],
  kimi: [
    "textarea[placeholder*='Ask' i]",
    "textarea[placeholder*='Message' i]",
    "textarea[aria-label*='Ask' i]",
    "textarea[aria-label*='Message' i]",
    "div[contenteditable='true'][role='textbox'][aria-label*='Ask' i]"
  ],
  minimax: [
    "textarea[placeholder*='Ask' i]",
    "textarea[placeholder*='Message' i]",
    "textarea[aria-label*='Ask' i]",
    "textarea[aria-label*='Message' i]",
    "div[contenteditable='true'][role='textbox'][aria-label*='Ask' i]"
  ],
  glm: [
    "textarea[placeholder*='Ask' i]",
    "textarea[placeholder*='Message' i]",
    "textarea[aria-label*='Ask' i]",
    "textarea[aria-label*='Message' i]",
    "div[contenteditable='true'][role='textbox'][aria-label*='Ask' i]"
  ],
  manus: [
    "textarea[placeholder*='Ask' i]",
    "textarea[placeholder*='Message' i]",
    "textarea[aria-label*='Ask' i]",
    "textarea[aria-label*='Message' i]",
    "div[contenteditable='true'][role='textbox'][aria-label*='Ask' i]"
  ],
  genspark: [
    "textarea[placeholder*='Ask' i]",
    "textarea[placeholder*='Message' i]",
    "textarea[aria-label*='Ask' i]",
    "textarea[aria-label*='Message' i]",
    "div[contenteditable='true'][role='textbox'][aria-label*='Ask' i]"
  ]
};

export class ServiceInputAdapter implements AIInputAdapter {
  constructor(readonly service: SupportedService) {}

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return SERVICE_HOSTS[this.service].some((host) => hostname === host || hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  }

  async insertText(text: string): Promise<AIInputInsertResult> {
    const input = findVisibleInput(SERVICE_SELECTORS[this.service]);
    if (input && insertIntoElement(input, text)) {
      return { success: true, reason: "inserted" };
    }

    return { success: false, reason: input ? "insert-failed" : "no-input" };
  }
}
