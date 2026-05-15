import type { ContextMode, PageContext } from "../types.js";

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

export function renderContextTemplate(context: PageContext, mode: ContextMode): string {
  const title = context.title.trim();
  const url = context.url.trim();
  const selection = context.selection.trim();

  switch (mode) {
    case "url":
      return url;
    case "title_url":
      return compact([
        "タイトル:",
        title,
        "",
        "URL:",
        url
      ]);
    case "selection":
      return selection;
    case "full_context":
      return withOptionalSelection([
        "このページについて扱います。",
        "",
        "タイトル:",
        title,
        "",
        "URL:",
        url
      ], selection);
    case "ask_about_page":
      return withOptionalSelection([
        "このページについて質問します。",
        "",
        "タイトル:",
        title,
        "",
        "URL:",
        url
      ], selection, "質問:");
    case "summarize_page":
      return withOptionalSelection([
        "次のページをわかりやすく要約してください。",
        "",
        "タイトル:",
        title,
        "",
        "URL:",
        url
      ], selection);
  }
}

function withOptionalSelection(lines: string[], selection: string, trailingLine?: string): string {
  const output = [...lines];
  if (selection) {
    output.push("", "選択範囲:", selection);
  }
  if (trailingLine) {
    output.push("", trailingLine);
  }
  return compact(output);
}

function compact(lines: string[]): string {
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}
