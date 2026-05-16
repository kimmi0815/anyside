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
  { mode: "summarize_page", label: "このページを要約" }
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
