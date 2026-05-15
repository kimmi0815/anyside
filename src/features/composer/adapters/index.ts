import type { AIInputAdapter, AIService } from "../types.js";
import { detectAIService } from "../lib/aiService.js";
import { GenericContentEditableAdapter } from "./generic.js";
import { ServiceInputAdapter } from "./serviceAdapters.js";

export function createAIInputAdapter(service: AIService): AIInputAdapter {
  if (service === "chatgpt" || service === "claude" || service === "gemini") {
    return new ServiceInputAdapter(service);
  }

  return new GenericContentEditableAdapter();
}

export function detectAIInputService(url: URL | string): AIService {
  return detectAIService(typeof url === "string" ? url : url.href);
}
