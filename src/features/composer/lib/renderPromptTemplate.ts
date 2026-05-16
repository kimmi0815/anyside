import type { AIService, PageContext } from "../types.js";
import { dateLocale, type ResolvedLanguage } from "../../../shared/i18n.js";

export function renderPromptTemplate(body: string, context: PageContext, service: AIService, language: ResolvedLanguage = "ja"): string {
  const replacements: Record<string, string> = {
    title: context.title || "",
    url: context.url || "",
    selection: context.selection || "",
    date: currentDate(language),
    service
  };

  return body
    .replace(/\{\{(title|url|selection|date|service)\}\}/g, (_match, key: string) => replacements[key] ?? "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function currentDate(language: ResolvedLanguage): string {
  return new Date().toLocaleDateString(dateLocale(language));
}
