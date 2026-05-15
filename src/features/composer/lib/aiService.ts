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

  if (isHostOrSubdomain(hostname, "claude.ai")) {
    return "claude";
  }

  if (hostname === "gemini.google.com") {
    return "gemini";
  }

  if (isHostOrSubdomain(hostname, "perplexity.ai")) {
    return "perplexity";
  }

  if (hostname === "notebooklm.google.com") {
    return "notebooklm";
  }

  return "unknown";
}

export function aiServiceLabel(service: AIService): string {
  switch (service) {
    case "chatgpt":
      return "ChatGPT";
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    case "perplexity":
      return "Perplexity";
    case "notebooklm":
      return "NotebookLM";
    case "unknown":
      return "";
  }
}

function isHostOrSubdomain(hostname: string, rootHost: string): boolean {
  return hostname === rootHost || hostname.endsWith(`.${rootHost}`);
}
