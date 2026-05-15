import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CUSTOM_PROMPT_TEMPLATES_KEY,
  addCustomPromptTemplate,
  deleteCustomPromptTemplate,
  getCustomPromptTemplates,
  normalizeCustomPromptTemplates,
  updateCustomPromptTemplate
} from "../dist/storage/promptTemplateStorage.js";

test("normalizeCustomPromptTemplates keeps only valid custom prompts", () => {
  const normalized = normalizeCustomPromptTemplates([
    null,
    { id: "built-in", title: "Built in", body: "Ignored" },
    { id: "custom:kept", title: "  My Prompt  ", category: "", body: " Body ", favorite: false, createdAt: 1, updatedAt: 2 },
    { id: "custom:empty", title: "", body: "No title" }
  ]);

  assert.equal(normalized.length, 2);
  assert.match(normalized[0].id, /^custom:/);
  assert.equal(normalized[0].title, "Built in");
  assert.equal(normalized[0].category, "カスタム");
  assert.equal(normalized[1].id, "custom:kept");
  assert.equal(normalized[1].title, "My Prompt");
  assert.equal(normalized[1].body, "Body");
  assert.equal(normalized[1].favorite, false);
});

test("custom prompt storage adds, updates, and deletes templates", async () => {
  const storageData = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          const keyList = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(keyList.map((key) => [key, storageData[key]]));
        },
        async set(values) {
          Object.assign(storageData, values);
        }
      }
    }
  };

  try {
    let templates = await addCustomPromptTemplate({
      title: "Deep dive",
      category: "",
      body: "Explain {{selection}}"
    });

    assert.equal(templates.length, 1);
    assert.match(templates[0].id, /^custom:/);
    assert.equal(templates[0].category, "カスタム");
    assert.equal(storageData[CUSTOM_PROMPT_TEMPLATES_KEY].length, 1);

    templates = await updateCustomPromptTemplate(templates[0].id, {
      title: "Updated",
      category: "分析",
      body: "Review {{url}}",
      favorite: false
    });

    assert.equal(templates[0].title, "Updated");
    assert.equal(templates[0].category, "分析");
    assert.equal(templates[0].favorite, false);

    templates = await deleteCustomPromptTemplate(templates[0].id);
    assert.deepEqual(templates, []);
    assert.deepEqual(await getCustomPromptTemplates(), []);
  } finally {
    delete globalThis.chrome;
  }
});
