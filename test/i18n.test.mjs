import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveLanguage, t } from "../dist/shared/i18n.js";
import { createActiveTabPrompt, createSelectionPrompt } from "../dist/shared/prompt.js";
import { getContextActions, renderContextTemplate, renderPromptTemplate } from "../dist/features/composer/index.js";

test("resolveLanguage honors explicit settings and browser auto-detection", () => {
  assert.equal(resolveLanguage("ja", "en-US"), "ja");
  assert.equal(resolveLanguage("en", "ja-JP"), "en");
  assert.equal(resolveLanguage("auto", "ja"), "ja");
  assert.equal(resolveLanguage("auto", "ja-JP"), "ja");
  assert.equal(resolveLanguage("auto", "en-US"), "en");
  assert.equal(resolveLanguage(undefined, ""), "en");
});

test("context actions and generated context templates localize without changing page data", () => {
  const context = {
    title: "Original title",
    url: "https://example.com/",
    selection: "Original selected text"
  };

  assert.equal(getContextActions("en").find((action) => action.mode === "selection")?.label, "Insert selected text");
  assert.equal(getContextActions("ja").find((action) => action.mode === "selection")?.label, "選択テキストを挿入");

  const english = renderContextTemplate(context, "ask_about_page", "en");
  assert.match(english, /I have a question about this page\./);
  assert.match(english, /Selection:/);
  assert.match(english, /Original selected text/);

  const japanese = renderContextTemplate(context, "ask_about_page", "ja");
  assert.match(japanese, /このページについて質問します。/);
  assert.match(japanese, /選択範囲:/);
  assert.match(japanese, /Original selected text/);
});

test("prompt helpers localize generated helper text only", () => {
  assert.match(createSelectionPrompt("Keep this text", "ja"), /次のテキストを/);
  assert.match(createSelectionPrompt("Keep this text", "ja"), /Keep this text/);
  assert.match(createSelectionPrompt("Keep this text", "en"), /Please explain/);

  assert.match(createActiveTabPrompt("Page title", "https://example.com/", "ja"), /タイトル:/);
  assert.match(createActiveTabPrompt("Page title", "https://example.com/", "en"), /Title:/);
});

test("prompt template rendering keeps stored template text intact while localizing dates", () => {
  const template = "User text stays as-is: {{title}} / {{date}}";
  const context = { title: "保持するタイトル", url: "", selection: "" };

  const english = renderPromptTemplate(template, context, "chatgpt", "en");
  const japanese = renderPromptTemplate(template, context, "chatgpt", "ja");

  assert.match(english, /User text stays as-is: 保持するタイトル/);
  assert.match(japanese, /User text stays as-is: 保持するタイトル/);
  assert.match(english, /\d{1,2}\/\d{1,2}\/\d{4}/);
  assert.match(japanese, /\d{4}\/\d{1,2}\/\d{1,2}/);
});

test("dictionary interpolates parameters", () => {
  assert.equal(t("en", "side.openService", { label: "ChatGPT" }), "Open ChatGPT");
  assert.equal(t("ja", "side.openService", { label: "ChatGPT" }), "ChatGPTを開く");
});

test("support options copy localizes donation and contact text", () => {
  assert.equal(t("en", "options.supportTitle"), "Support anyside");
  assert.match(t("en", "options.supportCopy"), /coffee-sized contribution/);
  assert.equal(t("en", "options.supportContact"), "Send feedback / support");

  assert.equal(t("ja", "options.supportTitle"), "anysideを応援");
  assert.match(t("ja", "options.supportCopy"), /コーヒー1杯分の応援/);
  assert.equal(t("ja", "options.supportContact"), "意見・要望・サポートを送る");
});

test("new shelf, draft, and page text labels are localized in English and Japanese", () => {
  assert.equal(t("en", "side.contextShelf"), "Context Shelf");
  assert.equal(t("ja", "side.contextShelf"), "Context Shelf");
  assert.equal(t("en", "side.promptDraft"), "Prompt Draft");
  assert.equal(t("ja", "side.promptDraft"), "Prompt Draft");
  assert.equal(t("en", "side.shelfInsert"), "Insert all");
  assert.equal(t("ja", "side.shelfInsert"), "すべて挿入");
  assert.equal(t("en", "side.shelfCopyAll"), "Copy all");
  assert.equal(t("ja", "side.shelfCopyAll"), "すべてコピー");
  assert.equal(t("en", "side.draftInsert"), "Insert Draft");
  assert.equal(t("ja", "side.draftInsert"), "Draftを挿入");
  assert.equal(t("en", "context.action.page_text"), "Insert page text");
  assert.equal(t("ja", "context.action.page_text"), "本文を挿入");
  assert.equal(t("en", "context.label.pageText"), "Page text:");
  assert.equal(t("ja", "context.label.pageText"), "本文:");
  assert.equal(t("en", "background.menuAddSelectionToShelf"), "Add selection to Context Shelf");
  assert.equal(t("ja", "background.menuAddSelectionToShelf"), "選択テキストをContext Shelfに追加");
});
