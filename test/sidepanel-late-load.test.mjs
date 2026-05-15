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
    "diagnosticsDetails",
    "diagnosticsTable"
  ];
  const buttonIds = [
    "reloadButton",
    "moreActionsButton",
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
  document.register(new FakeIFrameElement("aiFrame", document));
  return document;
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

  cloneNode() {
    return new this.constructor(this.id, this.ownerDocument);
  }

  dispatch(type) {
    for (const callback of this.listeners[type] ?? []) {
      callback({ target: this });
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
