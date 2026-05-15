import assert from "node:assert/strict";
import { test } from "node:test";

test("side panel hides fallback when the iframe loads after the normal timeout", async () => {
  const scheduler = createScheduler();
  const document = createSidepanelDocument();
  const storageData = {};

  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.window = {
    location: { search: "" },
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    setInterval: scheduler.setInterval,
    clearInterval: scheduler.clearInterval
  };
  globalThis.chrome = {
    runtime: {
      openOptionsPage() {},
      async sendMessage() {
        return { ok: true };
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
    },
    tabs: {
      async create() {}
    }
  };

  try {
    await import(`../dist/sidepanel/main.js?late-load-${Date.now()}`);
    await flushAsync();

    const composerToolbar = document.getElementById("composerToolbar");
    assert.equal(composerToolbar.dataset.expanded, "false");
    document.getElementById("composerLauncherButton").dispatch("click");
    assert.equal(composerToolbar.dataset.expanded, "true");
    document.dispatch("keydown", { key: "Escape" });
    assert.equal(composerToolbar.dataset.expanded, "false");

    scheduler.runByDelay(0);
    const frame = document.getElementById("aiFrame");
    scheduler.runByDelay(8000);

    assert.equal(document.getElementById("fallbackPanel").hidden, false);

    frame.dispatch("load");

    assert.equal(document.getElementById("fallbackPanel").hidden, true);
    assert.match(document.getElementById("statusText").textContent, /loaded after waiting/);
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLDetailsElement;
    delete globalThis.HTMLIFrameElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLTableSectionElement;
  }
});

test("side panel prompt palette includes custom prompt templates from storage", async () => {
  const scheduler = createScheduler();
  const document = createSidepanelDocument();
  const storageData = {
    "composer.promptTemplates": [
      {
        id: "custom:verification",
        title: "動作確認Prompt",
        category: "検証",
        body: "動作確認です。\n{{title}}\n{{url}}",
        favorite: true,
        createdAt: 1,
        updatedAt: 1
      }
    ]
  };

  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.window = {
    location: { search: "" },
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    setInterval: scheduler.setInterval,
    clearInterval: scheduler.clearInterval
  };
  globalThis.chrome = createChromeMock(storageData);

  try {
    await import(`../dist/sidepanel/main.js?custom-prompts-${Date.now()}`);
    await flushAsync();

    document.getElementById("composerLauncherButton").dispatch("click");
    document.getElementById("promptSearchInput").value = "動作確認";
    document.getElementById("promptButton").dispatch("click");
    await flushAsync();

    assert.match(textTree(document.getElementById("promptList")), /動作確認Prompt/);
    assert.match(textTree(document.getElementById("promptList")), /検証/);
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLDetailsElement;
    delete globalThis.HTMLIFrameElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLTableSectionElement;
  }
});

test("side panel URL field loads a user-entered URL and rejects invalid input", async () => {
  const scheduler = createScheduler();
  const document = createSidepanelDocument();
  const storageData = {};

  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.window = {
    location: { search: "" },
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    setInterval: scheduler.setInterval,
    clearInterval: scheduler.clearInterval
  };
  globalThis.chrome = createChromeMock(storageData);

  try {
    await import(`../dist/sidepanel/main.js?manual-url-${Date.now()}`);
    await flushAsync();

    const input = document.getElementById("currentUrlInput");
    input.value = "example.com/docs";
    input.dispatch("keydown", { key: "Enter" });
    scheduler.runByDelay(0);

    assert.equal(input.value, "https://example.com/docs");
    assert.equal(document.getElementById("aiFrame").src, "https://example.com/docs");
    assert.match(document.getElementById("statusText").textContent, /Loading example\.com/);

    input.value = "javascript:alert(1)";
    input.dispatch("keydown", { key: "Enter" });

    assert.equal(document.getElementById("aiFrame").src, "https://example.com/docs");
    assert.match(document.getElementById("statusText").textContent, /valid HTTPS URL/);
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLDetailsElement;
    delete globalThis.HTMLIFrameElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLTableSectionElement;
  }
});


function createSidepanelDocument() {
  const document = new FakeDocument();
  const elementIds = [
    "statusLive",
    "statusBanner",
    "statusBannerText",
    "statusText",
    "loadingSpinner",
    "elapsedText",
    "fallbackPanel",
    "fallbackServiceName",
    "fallbackReason",
    "setupPanel",
    "composerToast",
    "composerToolbar",
    "composerActions",
    "contextPopover",
    "contextSummary",
    "contextActions",
    "promptPalette",
    "promptList",
    "diagnosticsDetails",
    "diagnosticsTable"
  ];
  const buttonIds = [
    "reloadButton",
    "moreActionsButton",
    "composerLauncherButton",
    "contextButton",
    "promptButton",
    "fallbackOpenTabButton",
    "fallbackOpenWindowButton",
    "fallbackReloadButton",
    "setupOptionsButton"
  ];

  for (const id of elementIds) {
    document.register(new FakeElement(id, document));
  }
  for (const id of buttonIds) {
    document.register(new FakeButtonElement(id, document));
  }
  document.register(new FakeInputElement("currentUrlInput", document));
  document.register(new FakeInputElement("promptSearchInput", document));
  document.register(new FakeIFrameElement("aiFrame", document));
  return document;
}

function createChromeMock(storageData) {
  return {
    runtime: {
      openOptionsPage() {},
      async sendMessage() {
        return { ok: true };
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
    },
    tabs: {
      async create() {}
    }
  };
}

function textTree(element) {
  return [
    element.textContent,
    ...element.children.flatMap((child) => textTree(child))
  ].join(" ");
}

function createScheduler() {
  let nextId = 1;
  const timers = new Map();
  const addTimer = (callback, delay) => {
    const id = nextId++;
    timers.set(id, { callback, delay, cleared: false });
    return id;
  };

  return {
    setTimeout: addTimer,
    setInterval: addTimer,
    clearTimeout(id) {
      const timer = timers.get(id);
      if (timer) {
        timer.cleared = true;
      }
    },
    clearInterval(id) {
      const timer = timers.get(id);
      if (timer) {
        timer.cleared = true;
      }
    },
    runByDelay(delay) {
      for (const [id, timer] of [...timers]) {
        if (!timer.cleared && timer.delay === delay) {
          timers.delete(id);
          timer.callback();
        }
      }
    }
  };
}

class FakeDocument {
  elements = {};
  listeners = {};

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
    if (tagName === "input") {
      return new FakeInputElement("", this);
    }
    if (tagName === "iframe") {
      return new FakeIFrameElement("", this);
    }
    return new FakeElement("", this);
  }

  addEventListener(type, callback) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(callback);
  }

  dispatch(type, event = {}) {
    for (const callback of this.listeners[type] ?? []) {
      callback({ target: this, ...event });
    }
  }
}

class FakeElement {
  attributes = {};
  children = [];
  dataset = {};
  hidden = false;
  listeners = {};
  textContent = "";

  constructor(id, ownerDocument) {
    this.id = id;
    this.ownerDocument = ownerDocument;
  }

  addEventListener(type, callback) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(callback);
  }

  append(...children) {
    this.children.push(...children);
  }

  contains(target) {
    return target === this || this.children.includes(target);
  }

  cloneNode() {
    return new this.constructor(this.id, this.ownerDocument);
  }

  dispatch(type, event = {}) {
    for (const callback of this.listeners[type] ?? []) {
      callback({ target: this, stopPropagation() {}, preventDefault() {}, ...event });
    }
  }

  replaceWith(nextElement) {
    nextElement.id = this.id;
    this.ownerDocument.register(nextElement);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

class FakeButtonElement extends FakeElement {
  disabled = false;
  type = "button";
}

class FakeInputElement extends FakeElement {
  title = "";
  value = "";
}

class FakeIFrameElement extends FakeElement {
  src = "";
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
