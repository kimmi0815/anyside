import { t, type ResolvedLanguage } from "./i18n.js";

export function createSelectionPrompt(selectionText: string, language: ResolvedLanguage = "en"): string {
  return [
    t(language, "prompt.selectionIntro"),
    t(language, "prompt.selectionDetail"),
    "",
    "---",
    selectionText.trim(),
    "---"
  ].join("\n");
}

export function createActiveTabPrompt(title: string | undefined, url: string | undefined, language: ResolvedLanguage = "en"): string {
  return [
    t(language, "prompt.activeTabIntro"),
    t(language, "prompt.activeTabDetail"),
    "",
    t(language, "context.label.title"),
    title || t(language, "prompt.noTitle"),
    "",
    t(language, "context.label.url"),
    url || t(language, "prompt.noUrl")
  ].join("\n");
}
