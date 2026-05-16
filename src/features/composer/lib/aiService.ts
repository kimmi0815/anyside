import type { AIService } from "../types.js";

export function detectAIService(url: string | undefined): AIService {
  if (!url) {
    return "unknown";
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }

  if (isHostOrSubdomain(hostname, "chatgpt.com")) {
    return "chatgpt";
  }

  if (hostname === "gemini.google.com") {
    return "gemini";
  }

  if (isHostOrSubdomain(hostname, "claude.ai")) {
    return "claude";
  }

  if (isHostOrSubdomain(hostname, "perplexity.ai")) {
    return "perplexity";
  }

  if (hostname === "notebooklm.google.com") {
    return "notebooklm";
  }

  if (isHostOrSubdomain(hostname, "grok.com")) {
    return "grok";
  }

  if (hostname === "copilot.microsoft.com") {
    return "copilot";
  }

  if (isHostOrSubdomain(hostname, "deepseek.com")) {
    return "deepseek";
  }

  if (isHostOrSubdomain(hostname, "kimi.com")) {
    return "kimi";
  }

  if (isHostOrSubdomain(hostname, "minimax.io")) {
    return "minimax";
  }

  if (isHostOrSubdomain(hostname, "z.ai")) {
    return "glm";
  }

  if (isHostOrSubdomain(hostname, "manus.im")) {
    return "manus";
  }

  if (isHostOrSubdomain(hostname, "genspark.ai")) {
    return "genspark";
  }

  return "unknown";
}

export function aiServiceLabel(service: AIService): string {
  switch (service) {
    case "chatgpt":
      return "ChatGPT";
    case "gemini":
      return "Gemini";
    case "claude":
      return "Claude";
    case "perplexity":
      return "Perplexity";
    case "notebooklm":
      return "NotebookLM";
    case "grok":
      return "Grok";
    case "copilot":
      return "Copilot";
    case "deepseek":
      return "DeepSeek";
    case "kimi":
      return "Kimi";
    case "minimax":
      return "MiniMax";
    case "glm":
      return "GLM";
    case "manus":
      return "Manus";
    case "genspark":
      return "Genspark";
    case "unknown":
      return "";
  }
}

function isHostOrSubdomain(hostname: string, rootHost: string): boolean {
  return hostname === rootHost || hostname.endsWith(`.${rootHost}`);
}
