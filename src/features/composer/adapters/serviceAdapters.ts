import type { AIInputAdapter, AIInputInsertResult, AIService } from "../types.js";
import { findVisibleInput, GenericContentEditableAdapter, insertIntoElement } from "./generic.js";

type SupportedService = Extract<AIService, "chatgpt" | "claude" | "gemini">;

const SERVICE_HOSTS: Record<SupportedService, string[]> = {
  chatgpt: ["chatgpt.com", "chat.openai.com"],
  claude: ["claude.ai"],
  gemini: ["gemini.google.com"]
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
  ]
};

export class ServiceInputAdapter implements AIInputAdapter {
  private readonly genericAdapter = new GenericContentEditableAdapter();

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

    return this.genericAdapter.insertText(text);
  }
}
