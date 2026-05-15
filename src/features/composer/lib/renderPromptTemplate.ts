import type { AIService, PageContext } from "../types.js";
export function renderPromptTemplate(body: string, context: PageContext, service: AIService): string {
  const replacements: Record<string, string> = {
    title: context.title || "",
    url: context.url || "",
    selection: context.selection || "",
    date: currentDate(),
    service
  };

  return body
    .replace(/\{\{(title|url|selection|date|service)\}\}/g, (_match, key: string) => replacements[key] ?? "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function currentDate(): string {
  return new Date().toLocaleDateString("ja-JP");
}
