export type AIService =
  | "chatgpt"
  | "gemini"
  | "claude"
  | "perplexity"
  | "notebooklm"
  | "grok"
  | "copilot"
  | "deepseek"
  | "kimi"
  | "minimax"
  | "glm"
  | "manus"
  | "genspark"
  | "unknown";

export type AIInputService = AIService;

export type AIInputInsertReason = "inserted" | "no-input" | "insert-failed";

export type AIInputInsertResult = {
  success: boolean;
  reason: AIInputInsertReason;
};

export type AIInputAdapter = {
  service: AIService;
  canHandle(url: string): boolean;
  insertText(text: string): Promise<AIInputInsertResult>;
};

export type PageContext = {
  title: string;
  url: string;
  selection: string;
  timestamp: number;
};

export type ContextMode =
  | "url"
  | "title_url"
  | "selection"
  | "full_context"
  | "ask_about_page"
  | "summarize_page";

export type PromptTemplate = {
  id: string;
  title: string;
  category: string;
  body: string;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
};

export type InsertResult = {
  success: boolean;
  method: "direct" | "clipboard";
  service: AIService;
  reason?: "agent-unavailable" | AIInputInsertReason;
  message?: string;
};

export type ComposerAction =
  | {
      type: "insert_context";
      mode: ContextMode;
    }
  | {
      type: "insert_prompt";
      templateId: string;
    };
