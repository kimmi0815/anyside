import assert from "node:assert/strict";
import { test } from "node:test";

test("options restores services hidden from the side panel header", async () => {
  const document = createOptionsDocument();
  const storageData = {
    "anyside.settings": {
      defaultPresetId: "chatgpt",
      activePresetId: "chatgpt",
      customUrls: [],
      serviceOrder: ["chatgpt", "claude", "gemini", "notebooklm"],
      hiddenServiceIds: ["claude"],
      lastUrlByPreset: {
        chatgpt: "https://chatgpt.com/",
        claude: "https://claude.ai/",
        gemini: "https://gemini.google.com/",
        notebooklm: "https://notebooklm.google.com/",
        custom: ""
      },
      enableFrameHeaderRelaxation: false,
      frameHeaderRelaxationAcknowledged: false,
      diagnostics: {}
    }
  };

  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLFormElement = FakeFormElement;
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

    assert.match(textTree(document.getElementById("hiddenServiceList")), /Show Claude/);

    const restoreButton = findByDataset(document.getElementById("hiddenServiceList"), "restoreServiceId", "claude");
    document.getElementById("hiddenServiceList").dispatch("click", { target: restoreButton });
    await flushAsync();

    assert.deepEqual(storageData["anyside.settings"].hiddenServiceIds, []);
    assert.doesNotMatch(textTree(document.getElementById("hiddenServiceList")), /Show Claude/);
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLFormElement;
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
  for (const id of ["customLabelInput", "customUrlInput", "promptTitleInput", "promptCategoryInput"]) {
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
