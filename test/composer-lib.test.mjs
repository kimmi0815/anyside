import assert from "node:assert/strict";
import { test } from "node:test";

import { detectAIService, getPromptTemplate, PROMPT_TEMPLATES, renderContextTemplate, renderPromptTemplate } from "../dist/features/composer/index.js";

test("detectAIService maps known AI service URLs", () => {
  assert.equal(detectAIService("https://chatgpt.com/"), "chatgpt");
  assert.equal(detectAIService("https://chat.openai.chatgpt.com/"), "chatgpt");
  assert.equal(detectAIService("https://claude.ai/new"), "claude");
  assert.equal(detectAIService("https://gemini.google.com/app"), "gemini");
  assert.equal(detectAIService("https://www.perplexity.ai/search"), "perplexity");
  assert.equal(detectAIService("https://notebooklm.google.com/notebook/example"), "notebooklm");
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
  const rendered = renderPromptTemplate("{{title}}\n{{url}}\n{{selection}}\n{{service}}", {}, "unknown");
  assert.equal(rendered, "unknown");
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
