import type { ContextMode, PageContext } from "../types.js";
import type { ResolvedLanguage } from "../../../shared/i18n.js";
import { t } from "../../../shared/i18n.js";

export type ContextAction = {
  mode: ContextMode;
  label: string;
  requiresSelection?: boolean;
};

export const CONTEXT_ACTIONS: ContextAction[] = [
  { mode: "url", label: "URLを挿入" },
  { mode: "title_url", label: "タイトル + URLを挿入" },
  { mode: "selection", label: "選択テキストを挿入", requiresSelection: true },
  { mode: "full_context", label: "ページ情報をまとめて挿入" },
  { mode: "ask_about_page", label: "このページについて質問" },
  { mode: "summarize_page", label: "このページを要約" },
  { mode: "page_text", label: "本文を挿入" },
  { mode: "summarize_page_with_text", label: "本文つきで要約" }
];

export function getContextActions(language: ResolvedLanguage): ContextAction[] {
  return CONTEXT_ACTIONS.map((action) => ({
    ...action,
    label: t(language, `context.action.${action.mode}` as Parameters<typeof t>[1])
  }));
}

export function renderContextTemplate(context: PageContext, mode: ContextMode, language: ResolvedLanguage = "ja"): string {
  const title = context.title.trim();
  const url = context.url.trim();
  const selection = context.selection.trim();
  const domain = (context.domain || domainFromUrl(url)).trim();
  const headings = Array.isArray(context.headings) ? context.headings.map((heading) => heading.trim()).filter(Boolean) : [];
  const pageText = (context.pageText || "").trim();

  switch (mode) {
    case "url":
      return url;
    case "title_url":
      return compact([
        t(language, "context.label.title"),
        title,
        "",
        t(language, "context.label.url"),
        url
      ]);
    case "selection":
      return selection;
    case "full_context":
      return withOptionalSelection([
        t(language, "context.fullIntro"),
        "",
        t(language, "context.label.title"),
        title,
        "",
        t(language, "context.label.url"),
        url
      ], selection, language);
    case "ask_about_page":
      return withOptionalSelection([
        t(language, "context.askIntro"),
        "",
        t(language, "context.label.title"),
        title,
        "",
        t(language, "context.label.url"),
        url
      ], selection, language, t(language, "context.question"));
    case "summarize_page":
      return withOptionalSelection([
        t(language, "context.summarizeIntro"),
        "",
        t(language, "context.label.title"),
        title,
        "",
        t(language, "context.label.url"),
        url
      ], selection, language);
    case "page_text":
      return compact(pageTextLines([
        t(language, "context.label.title"),
        title,
        "",
        t(language, "context.label.url"),
        url,
        "",
        contextLabel("domain", language),
        domain
      ], headings, pageText, language, context.pageTextTruncated));
    case "summarize_page_with_text":
      return compact(pageTextLines([
        contextLabel("summarizeWithTextIntro", language),
        "",
        t(language, "context.label.title"),
        title,
        "",
        t(language, "context.label.url"),
        url,
        "",
        contextLabel("domain", language),
        domain
      ], headings, pageText, language, context.pageTextTruncated));
  }
}

function withOptionalSelection(lines: string[], selection: string, language: ResolvedLanguage, trailingLine?: string): string {
  const output = [...lines];
  if (selection) {
    output.push("", t(language, "context.label.selection"), selection);
  }
  if (trailingLine) {
    output.push("", trailingLine);
  }
  return compact(output);
}

function compact(lines: string[]): string {
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function pageTextLines(lines: string[], headings: string[], pageText: string, language: ResolvedLanguage, truncated?: boolean): string[] {
  const output = [...lines];
  if (headings.length > 0) {
    output.push("", contextLabel("headings", language), headings.join("\n"));
  }
  if (pageText) {
    output.push("", contextLabel("pageText", language), pageText);
  }
  if (truncated) {
    output.push("", contextLabel("pageTextTruncated", language));
  }
  return output;
}

function contextLabel(kind: "domain" | "headings" | "pageText" | "pageTextTruncated" | "summarizeWithTextIntro", language: ResolvedLanguage): string {
  if (language === "ja") {
    switch (kind) {
      case "domain":
        return "ドメイン:";
      case "headings":
        return "見出し:";
      case "pageText":
        return "本文:";
      case "pageTextTruncated":
        return "本文は上限に合わせて短縮されています。";
      case "summarizeWithTextIntro":
        return "次のページ本文をわかりやすく要約してください。";
    }
  }

  switch (kind) {
    case "domain":
      return "Domain:";
    case "headings":
      return "Headings:";
    case "pageText":
      return "Page text:";
    case "pageTextTruncated":
      return "Page text was truncated to fit the limit.";
    case "summarizeWithTextIntro":
      return "Please summarize the following page text clearly.";
  }
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url.trim()).hostname;
  } catch {
    return "";
  }
}
