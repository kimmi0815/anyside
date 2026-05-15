import assert from "node:assert/strict";
import { test } from "node:test";

import { makeCustomPresetId, resolveTarget } from "../dist/shared/presets.js";
import { defaultSettings } from "../dist/shared/storage.js";
import { labelFromUrl, normalizeUserUrl } from "../dist/shared/url.js";

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
