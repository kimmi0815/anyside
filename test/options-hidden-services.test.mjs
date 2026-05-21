import assert from "node:assert/strict";
import { test } from "node:test";

test("options toggles quick access services in the side panel header", async () => {
  const document = createOptionsDocument();
  const storageData = {
    "anyside.settings": createSettings({ hiddenServiceIds: ["claude"] })
  };

  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLFormElement = FakeFormElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLImageElement = FakeImageElement;
  globalThis.document = document;
  globalThis.chrome = createChromeMock(storageData);
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };

  try {
    await import(`../dist/options/main.js?hidden-services-${Date.now()}`);
    await flushAsync();

    assert.match(textTree(document.getElementById("hiddenServiceList")), /Quick access/);
    assert.match(textTree(document.getElementById("hiddenServiceList")), /Claude/);
    assert.match(textTree(document.getElementById("hiddenServiceList")), /Grok/);

    const claudeToggle = findByDataset(document.getElementById("hiddenServiceList"), "quickAccessId", "claude");
    claudeToggle.checked = true;
    document.getElementById("hiddenServiceList").dispatch("change", { target: claudeToggle });
    await flushAsync();

    assert.deepEqual(storageData["anyside.settings"].hiddenServiceIds, []);

    const grokToggle = findByDataset(document.getElementById("hiddenServiceList"), "quickAccessId", "grok");
    grokToggle.checked = false;
    document.getElementById("hiddenServiceList").dispatch("change", { target: grokToggle });
    await flushAsync();

    assert.deepEqual(storageData["anyside.settings"].hiddenServiceIds, ["grok"]);
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLFormElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLImageElement;
    delete globalThis.IntersectionObserver;
  }
});

test("options renders custom prompt templates under category groups", async () => {
  const document = createOptionsDocument();
  const storageData = {
    "anyside.settings": createSettings(),
    "composer.promptTemplates": [
      {
        id: "custom:research-a",
        title: "A",
        category: "Research",
        body: "A body",
        favorite: true,
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: "custom:research-b",
        title: "B",
        category: "Research",
        body: "B body",
        favorite: true,
        createdAt: 2,
        updatedAt: 2
      },
      {
        id: "custom:writing-c",
        title: "C",
        category: "Writing",
        body: "C body",
        favorite: true,
        createdAt: 3,
        updatedAt: 3
      }
    ]
  };

  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLFormElement = FakeFormElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLImageElement = FakeImageElement;
  globalThis.document = document;
  globalThis.chrome = createChromeMock(storageData);
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };

  try {
    await import(`../dist/options/main.js?prompt-groups-${Date.now()}`);
    await flushAsync();

    const groups = findAllByClass(document.getElementById("promptTemplateList"), "prompt-category-group");
    assert.equal(groups.length, 2);
    assert.match(textTree(groups[0]), /Research/);
    assert.match(textTree(groups[0]), /2 prompts/);
    // Default: all categories are expanded so the user sees rows immediately.
    assert.equal(findAllByClass(groups[0], "prompt-category-items")[0].hidden, false);

    const categoryToggle = findByDataset(groups[0], "promptCategory", "Research");
    // Toggling collapses an expanded category.
    document.getElementById("promptTemplateList").dispatch("click", { target: categoryToggle });
    assert.equal(findAllByClass(document.getElementById("promptTemplateList"), "prompt-category-items")[0].hidden, true);
    // Toggling again expands it.
    document.getElementById("promptTemplateList").dispatch("click", { target: categoryToggle });
    assert.equal(findAllByClass(document.getElementById("promptTemplateList"), "prompt-category-items")[0].hidden, false);

    const categoryOptions = document.getElementById("promptCategoryOptions");
    assert.deepEqual(categoryOptions.children.map((option) => option.value), ["Research", "Writing"]);
    assert.equal(document.getElementById("promptCategoryInput").attributes["list"], "promptCategoryOptions");

    const expandedGroups = findAllByClass(document.getElementById("promptTemplateList"), "prompt-category-group");
    assert.equal(findAllByClass(groups[0], "entry").length, 2);
    assert.match(textTree(expandedGroups[1]), /Writing/);
    assert.equal(findAllByClass(expandedGroups[1], "entry").length, 1);
    assert.equal(findAllByClass(expandedGroups[0], "entry-icon").length, 0);
    assert.equal(findAllByClass(expandedGroups[1], "entry-icon").length, 0);
    // The per-entry category tag was removed (category is already shown as the group header).
    assert.equal(findAllByClass(expandedGroups[0], "entry-tag").length, 0);
    assert.equal(findByDataset(expandedGroups[0], "entryId", "custom:research-a")?.dataset.entryId, "custom:research-a");
    assert.equal(findByDataset(expandedGroups[0], "entryId", "custom:research-b")?.dataset.entryId, "custom:research-b");
    assert.equal(findByDataset(expandedGroups[1], "entryId", "custom:writing-c")?.dataset.entryId, "custom:writing-c");
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLFormElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLImageElement;
    delete globalThis.IntersectionObserver;
  }
});

function createOptionsDocument() {
  const document = new FakeDocument();
  for (const id of [
    "hiddenServiceList",
    "customUrlList",
    "promptTemplateList",
    "promptCategoryOptions",
    "statusText",
    "aboutVersion"
  ]) {
    document.register(new FakeElement(id, document));
  }
  for (const id of ["customUrlForm", "promptTemplateForm"]) {
    document.register(new FakeFormElement(id, document));
  }
  for (const id of ["promptSubmitButton", "resetSettingsButton"]) {
    document.register(new FakeButtonElement(id, document));
  }
  for (const id of ["customLabelInput", "customUrlInput", "promptTitleInput", "promptCategoryInput", "languageSelect"]) {
    document.register(new FakeInputElement(id, document));
  }
  document.register(new FakeInputElement("promptBodyInput", document));
  return document;
}

function createChromeMock(storageData) {
  return {
    runtime: {
      async sendMessage() {
        return { ok: true, settings: storageData["anyside.settings"] };
      },
      getManifest() {
        return { version: "0.1.0", name: "anyside" };
      }
    },
    storage: {
      onChanged: { addListener() {} },
      local: {
        async get(keys) {
          const keyList = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(keyList.map((key) => [key, storageData[key]]));
        },
        async set(values) {
          Object.assign(storageData, values);
        },
        async remove(keys) {
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const key of keyList) {
            delete storageData[key];
          }
        }
      }
    }
  };
}

function createSettings(overrides = {}) {
  return {
    defaultPresetId: "chatgpt",
    activePresetId: "chatgpt",
    customUrls: [],
    serviceOrder: ["chatgpt", "gemini", "claude", "perplexity", "notebooklm", "grok"],
    hiddenServiceIds: [],
    quickAccessConfigured: true,
    lastUrlByPreset: {
      chatgpt: "https://chatgpt.com/",
      gemini: "https://gemini.google.com/",
      claude: "https://claude.ai/",
      notebooklm: "https://notebooklm.google.com/",
      perplexity: "https://www.perplexity.ai/",
      grok: "https://grok.com/",
      custom: ""
    },
    enableFrameHeaderRelaxation: false,
    frameHeaderRelaxationAcknowledged: false,
    diagnostics: {},
    ...overrides
  };
}

function textTree(element) {
  return [
    element.textContent,
    ...element.children.flatMap((child) => textTree(child))
  ].join(" ");
}

function findByDataset(element, key, value) {
  if (element.dataset[key] === value) {
    return element;
  }
  for (const child of element.children) {
    const found = findByDataset(child, key, value);
    if (found) {
      return found;
    }
  }
  return null;
}

function findAllByClass(element, className) {
  const ownClasses = String(element.className || "").split(/\s+/);
  const matches = ownClasses.includes(className) ? [element] : [];
  for (const child of element.children) {
    matches.push(...findAllByClass(child, className));
  }
  return matches;
}

class FakeDocument {
  elements = {};

  register(element) {
    this.elements[element.id] = element;
    return element;
  }

  getElementById(id) {
    return this.elements[id] ?? null;
  }

  createElement(tagName) {
    if (tagName === "button") {
      return new FakeButtonElement("", this);
    }
    if (tagName === "form") {
      return new FakeFormElement("", this);
    }
    if (tagName === "img") {
      return new FakeImageElement("", this);
    }
    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      return new FakeInputElement("", this);
    }
    return new FakeElement("", this);
  }

  createElementNS(_namespace, tagName) {
    return this.createElement(tagName);
  }
}

class FakeElement {
  attributes = {};
  children = [];
  dataset = {};
  hidden = false;
  listeners = {};
  parentElement = null;
  value = "";

  constructor(id, ownerDocument) {
    this.id = id;
    this.ownerDocument = ownerDocument;
    this._textContent = "";
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  addEventListener(type, callback) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(callback);
  }

  append(...children) {
    for (const child of children) {
      if (child && typeof child === "object") {
        child.parentElement = this;
      }
    }
    this.children.push(...children);
  }

  dispatch(type, event = {}) {
    for (const callback of this.listeners[type] ?? []) {
      callback({ target: this, preventDefault() {}, ...event });
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  closest(selector) {
    if (selector === "button[data-prompt-category]" && this instanceof FakeButtonElement && this.dataset.promptCategory) {
      return this;
    }
    if (selector === "button[data-delete-prompt-id]" && this instanceof FakeButtonElement && this.dataset.deletePromptId) {
      return this;
    }
    if (selector === "button[data-delete-id]" && this instanceof FakeButtonElement && this.dataset.deleteId) {
      return this;
    }
    if (selector === ".entry" && this.className?.split?.(/\s+/).includes("entry")) {
      return this;
    }
    return this.parentElement?.closest?.(selector) ?? null;
  }

  focus() {}
}

class FakeButtonElement extends FakeElement {
  disabled = false;
  type = "button";
}

class FakeFormElement extends FakeElement {}

class FakeInputElement extends FakeElement {
  checked = false;
}

class FakeImageElement extends FakeElement {
  alt = "";
  src = "";
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
