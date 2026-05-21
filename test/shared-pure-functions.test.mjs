import assert from "node:assert/strict";
import { test } from "node:test";

import { makeCustomPresetId, resolveTarget } from "../dist/shared/presets.js";
import { defaultSettings } from "../dist/shared/storage.js";
import { labelFromUrl, normalizeUserUrl } from "../dist/shared/url.js";
import { extractPageContentFromSnapshot } from "../dist/shared/pageContent.js";

test("normalizeUserUrl accepts secure URLs and local development URLs", () => {
  assert.equal(normalizeUserUrl("example.com/path?q=1"), "https://example.com/path?q=1");
  assert.equal(normalizeUserUrl(" https://chatgpt.com/ "), "https://chatgpt.com/");
  assert.equal(normalizeUserUrl("localhost:5173/app"), "http://localhost:5173/app");
  assert.equal(normalizeUserUrl("127.0.0.1:3000"), "http://127.0.0.1:3000/");
});

test("normalizeUserUrl rejects empty, unsupported, and remote insecure URLs", () => {
  assert.equal(normalizeUserUrl(""), null);
  assert.equal(normalizeUserUrl("mailto:hello@example.com"), null);
  assert.equal(normalizeUserUrl("ftp://example.com"), null);
  assert.equal(normalizeUserUrl("http://example.com"), null);
});

test("labelFromUrl derives a readable host label", () => {
  assert.equal(labelFromUrl("https://www.example.com/path"), "example.com");
  assert.equal(labelFromUrl("not a url"), "Custom URL");
});

test("resolveTarget resolves saved custom URLs from settings", () => {
  const settings = defaultSettings();
  const customId = "research";
  const presetId = makeCustomPresetId(customId);

  settings.customUrls = [
    {
      id: customId,
      label: "Research Workspace",
      url: "https://research.example.com/",
      createdAt: 1
    }
  ];
  settings.activePresetId = presetId;
  settings.lastUrlByPreset[presetId] = "https://research.example.com/thread";

  assert.deepEqual(resolveTarget(settings), {
    id: presetId,
    label: "Research Workspace",
    url: "https://research.example.com/thread",
    isCustom: true
  });
});

test("extractPageContentFromSnapshot falls back article to main to body and tracks truncation", () => {
  const articleFallback = extractPageContentFromSnapshot({
    title: "  Article  ",
    url: "https://docs.example.com/read",
    headings: ["Intro", "Intro", "Cookie settings", "Details"],
    articleText: "Cookie banner",
    mainText: "Main paragraph ".repeat(20),
    bodyText: "Body paragraph ".repeat(20)
  }, { textLimit: 40, headingLimit: 2, now: 123 });

  assert.equal(articleFallback.source, "main");
  assert.equal(articleFallback.domain, "docs.example.com");
  assert.deepEqual(articleFallback.headings, ["Intro", "Details"]);
  assert.equal(articleFallback.pageText.length, 40);
  assert.equal(articleFallback.truncated.pageText, true);
  assert.equal(articleFallback.truncated.headings, false);
  assert.equal(articleFallback.timestamp, 123);

  const bodyFallback = extractPageContentFromSnapshot({
    articleText: "",
    mainText: "",
    bodyText: [
      "Navigation",
      "Useful body text",
      "Advertisement",
      "Another useful line"
    ].join("\n")
  }, { textLimit: 100 });

  assert.equal(bodyFallback.source, "body");
  assert.equal(bodyFallback.pageText, "Useful body text\nAnother useful line");
});
