import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTEXT_SHELF_ITEM_TEXT_LIMIT,
  addContextShelfItem,
  clearContextShelfItems,
  createContextShelfItem,
  deleteContextShelfItem,
  detectAIService,
  formatContextShelfItems,
  getContextActions,
  getPromptTemplate,
  markPromptDraftCopied,
  markPromptDraftInserted,
  normalizePromptDraft,
  PROMPT_TEMPLATES,
  promptDraftActionText,
  promptTemplateUsesPageText,
  removeContextShelfItem,
  renderContextTemplate,
  renderPromptTemplate,
  setPromptDraftTarget,
  updatePromptDraftText,
  clearPromptDraft
} from "../dist/features/composer/index.js";

test("detectAIService maps known AI service URLs", () => {
  assert.equal(detectAIService("https://chatgpt.com/"), "chatgpt");
  assert.equal(detectAIService("https://chat.openai.chatgpt.com/"), "chatgpt");
  assert.equal(detectAIService("https://gemini.google.com/app"), "gemini");
  assert.equal(detectAIService("https://claude.ai/new"), "claude");
  assert.equal(detectAIService("https://www.perplexity.ai/search"), "perplexity");
  assert.equal(detectAIService("https://notebooklm.google.com/notebook/example"), "notebooklm");
  assert.equal(detectAIService("https://grok.com/"), "grok");
  assert.equal(detectAIService("https://copilot.microsoft.com/chats/new"), "copilot");
  assert.equal(detectAIService("https://chat.deepseek.com/"), "deepseek");
  assert.equal(detectAIService("https://www.kimi.com/"), "kimi");
  assert.equal(detectAIService("https://agent.minimax.io/"), "minimax");
  assert.equal(detectAIService("https://chat.z.ai/"), "glm");
  assert.equal(detectAIService("https://manus.im/"), "manus");
  assert.equal(detectAIService("https://www.genspark.ai/"), "genspark");
  assert.equal(detectAIService("https://example.com/"), "unknown");
  assert.equal(detectAIService("not a url"), "unknown");
});

test("renderPromptTemplate replaces placeholders and normalizes whitespace", () => {
  const rendered = renderPromptTemplate(
    [
      "Use {{service}} on {{date}}",
      "",
      "{{title}}",
      "{{url}}",
      "{{selection}}",
      "",
      "",
      "",
      "",
      "Done"
    ].join("\n"),
    {
      title: "  Example page  ",
      url: " https://example.com/path ",
      selection: " Selected text "
    },
    "chatgpt"
  );

  assert.match(rendered, /^Use chatgpt on \d{4}\/\d{1,2}\/\d{1,2}/);
  assert.match(rendered, /Example page/);
  assert.match(rendered, /https:\/\/example\.com\/path/);
  assert.match(rendered, /Selected text/);
  assert.doesNotMatch(rendered, /\n{4,}/);
});

test("renderPromptTemplate uses empty strings for missing values", () => {
  const rendered = renderPromptTemplate("{{title}}\n{{url}}\n{{selection}}\n{{draft}}\n{{pageText}}\n{{headings}}\n{{domain}}\n{{service}}", {}, "unknown");
  assert.equal(rendered, "unknown");
});

test("renderPromptTemplate expands page body variables while preserving legacy variables", () => {
  const rendered = renderPromptTemplate(
    [
      "Domain: {{domain}}",
      "Headings:",
      "{{headings}}",
      "Text:",
      "{{pageText}}",
      "Draft:",
      "{{draft}}",
      "Legacy: {{title}} | {{url}} | {{selection}} | {{service}}"
    ].join("\n"),
    {
      title: "Example page",
      url: " https://news.example.com/path ",
      selection: "Selected quote",
      draft: "Draft note",
      headings: [" Intro ", "", "Details"],
      pageText: "Page body text"
    },
    "claude",
    "en"
  );

  assert.equal(rendered, [
    "Domain: news.example.com",
    "Headings:",
    "Intro",
    "Details",
    "Text:",
    "Page body text",
    "Draft:",
    "Draft note",
    "Legacy: Example page |  https://news.example.com/path  | Selected quote | claude"
  ].join("\n"));

  assert.equal(renderPromptTemplate("{{domain}}", { title: "", url: "not a url", selection: "", domain: " docs.example.com " }, "unknown"), "docs.example.com");
});

test("promptTemplateUsesPageText ignores Draft-only templates", () => {
  assert.equal(promptTemplateUsesPageText("Use {{draft}} with {{title}}"), false);
  assert.equal(promptTemplateUsesPageText("Use {{draft}} with {{pageText}}"), true);
});

test("prompt templates include no built-in defaults", () => {
  assert.deepEqual(PROMPT_TEMPLATES, []);
  assert.equal(getPromptTemplate("summarize-page"), undefined);
});

test("renderContextTemplate omits the selection block when selection is empty", () => {
  const rendered = renderContextTemplate(
    {
      title: "Example page",
      url: "https://example.com/",
      selection: ""
    },
    "full_context"
  );

  assert.match(rendered, /このページについて扱います。/);
  assert.match(rendered, /Example page/);
  assert.doesNotMatch(rendered, /選択範囲:/);
});

test("renderContextTemplate includes selection naturally when present", () => {
  const rendered = renderContextTemplate(
    {
      title: "Example page",
      url: "https://example.com/",
      selection: "Important passage"
    },
    "ask_about_page"
  );

  assert.match(rendered, /このページについて質問します。/);
  assert.match(rendered, /選択範囲:/);
  assert.match(rendered, /Important passage/);
});

test("existing context action modes and menu entries stay unchanged", () => {
  const context = {
    title: "Example page",
    url: "https://example.com/article",
    selection: "Important passage"
  };

  const modes = getContextActions("ja").map((action) => action.mode);
  assert.deepEqual(modes.slice(0, 6), [
    "url",
    "title_url",
    "selection",
    "full_context",
    "ask_about_page",
    "summarize_page"
  ]);
  assert.deepEqual(modes.slice(6), ["page_text", "summarize_page_with_text"]);

  assert.deepEqual({
    url: renderContextTemplate(context, "url", "ja"),
    title_url: renderContextTemplate(context, "title_url", "ja"),
    selection: renderContextTemplate(context, "selection", "ja"),
    full_context: renderContextTemplate(context, "full_context", "ja"),
    ask_about_page: renderContextTemplate(context, "ask_about_page", "ja"),
    summarize_page: renderContextTemplate(context, "summarize_page", "ja")
  }, {
    url: "https://example.com/article",
    title_url: "タイトル:\nExample page\n\nURL:\nhttps://example.com/article",
    selection: "Important passage",
    full_context: "このページについて扱います。\n\nタイトル:\nExample page\n\nURL:\nhttps://example.com/article\n\n選択範囲:\nImportant passage",
    ask_about_page: "このページについて質問します。\n\nタイトル:\nExample page\n\nURL:\nhttps://example.com/article\n\n選択範囲:\nImportant passage\n\n質問:",
    summarize_page: "次のページをわかりやすく要約してください。\n\nタイトル:\nExample page\n\nURL:\nhttps://example.com/article\n\n選択範囲:\nImportant passage"
  });
});

test("page body context modes render explicit body context after the existing menu entries", () => {
  const context = {
    title: "Readable page",
    url: "https://docs.example.com/read",
    selection: "",
    headings: ["Intro", "Details"],
    pageText: "First paragraph.\nSecond paragraph.",
    pageTextTruncated: true
  };

  assert.equal(renderContextTemplate(context, "page_text", "en"), [
    "Title:",
    "Readable page",
    "",
    "URL:",
    "https://docs.example.com/read",
    "",
    "Domain:",
    "docs.example.com",
    "",
    "Headings:",
    "Intro\nDetails",
    "",
    "Page text:",
    "First paragraph.\nSecond paragraph.",
    "",
    "Page text was truncated to fit the limit."
  ].join("\n"));
});

test("context shelf helpers add, delete, clear, format, and enforce limits", () => {
  const first = createContextShelfItem({
    id: "first",
    kind: "selection",
    title: "  Quote  ",
    text: " Selected text ",
    url: " https://example.com/a ",
    domain: " example.com ",
    createdAt: 1
  });
  const second = createContextShelfItem({
    id: "second",
    kind: "page_text",
    title: "Article",
    text: "Body text",
    createdAt: 2,
    truncated: true
  });
  const third = createContextShelfItem({
    id: "third",
    kind: "title_url",
    title: "Title + URL",
    text: "https://example.com/c",
    createdAt: 3
  });

  assert.ok(first);
  assert.ok(second);
  assert.ok(third);

  let items = addContextShelfItem([], first, 2);
  items = addContextShelfItem(items, second, 2);
  items = addContextShelfItem(items, third, 2);
  assert.deepEqual(items.map((item) => item.id), ["second", "third"]);

  const formatted = formatContextShelfItems(items, "en");
  assert.match(formatted, /#1 Page text: Article/);
  assert.match(formatted, /Page text was truncated to fit the limit\./);
  assert.match(formatted, /#2 Title \+ URL: Title \+ URL/);

  assert.deepEqual(removeContextShelfItem(items, "missing").map((item) => item.id), ["second", "third"]);
  items = deleteContextShelfItem(items, "second");
  assert.deepEqual(items.map((item) => item.id), ["third"]);
  assert.deepEqual(clearContextShelfItems(), []);

  const longItem = createContextShelfItem({
    id: "long",
    kind: "page_text",
    title: "Long",
    text: "x".repeat(CONTEXT_SHELF_ITEM_TEXT_LIMIT + 10)
  });
  assert.equal(longItem.text.length, CONTEXT_SHELF_ITEM_TEXT_LIMIT);
  assert.equal(longItem.truncated, true);
});

test("prompt draft helpers edit, insert, copy, clear, and expose target text", () => {
  let draft = normalizePromptDraft({
    text: "  Original draft  ",
    updatedAt: 10,
    lastTargetId: "chatgpt"
  });

  assert.equal(promptDraftActionText(draft), "Original draft");

  draft = updatePromptDraftText(draft, "  Review this page  ", 11);
  assert.equal(draft.text, "  Review this page  ");
  assert.equal(draft.updatedAt, 11);
  assert.equal(draft.lastAction, "edit");
  assert.equal(promptDraftActionText(draft), "Review this page");

  draft = setPromptDraftTarget(draft, "claude", 12);
  assert.equal(draft.lastTargetId, "claude");
  assert.equal(draft.updatedAt, 12);

  draft = markPromptDraftInserted(draft, 13);
  assert.equal(draft.lastAction, "insert");
  assert.equal(draft.text, "  Review this page  ");

  draft = markPromptDraftCopied(draft, 14);
  assert.equal(draft.lastAction, "copy");
  assert.equal(promptDraftActionText(draft), "Review this page");

  const cleared = clearPromptDraft(15);
  assert.deepEqual(cleared, { text: "", updatedAt: 15, lastAction: "clear" });
  assert.equal(promptDraftActionText(cleared), "");
});
