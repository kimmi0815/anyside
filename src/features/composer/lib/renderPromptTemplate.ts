import type { AIService, PageContext } from "../types.js";
import { dateLocale, type ResolvedLanguage } from "../../../shared/i18n.js";

export function renderPromptTemplate(body: string, context: PageContext, service: AIService, language: ResolvedLanguage = "ja"): string {
  const replacements: Record<string, string> = {
    title: context.title || "",
    url: context.url || "",
    selection: context.selection || "",
    date: currentDate(language),
    service,
    draft: context.draft || "",
    pageText: context.pageText || "",
    headings: Array.isArray(context.headings) ? context.headings.map((heading) => heading.trim()).filter(Boolean).join("\n") : "",
    domain: context.domain?.trim() || domainFromUrl(context.url)
  };

  return body
    .replace(/\{\{(title|url|selection|date|service|draft|pageText|headings|domain)\}\}/g, (_match, key: string) => replacements[key] ?? "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function promptTemplateUsesPageText(body: string): boolean {
  return /\{\{(?:pageText|headings|domain)\}\}/.test(body);
}

function currentDate(language: ResolvedLanguage): string {
  return new Date().toLocaleDateString(dateLocale(language));
}

function domainFromUrl(url: string | undefined): string {
  if (!url) {
    return "";
  }
  try {
    return new URL(url.trim()).hostname;
  } catch {
    return "";
  }
}
