import assert from "node:assert/strict";
import { test } from "node:test";

let importCounter = 0;

test("background routing does not send unknown custom URLs to the newest unrelated agent", async () => {
  const { worker } = await importWorker();

  const selection = worker.__testing.selectAiInputAgent(
    [
      agent({ service: "chatgpt", url: "https://chatgpt.com/", connectedAt: 1 }),
      agent({ service: "claude", url: "https://claude.ai/", connectedAt: 2 })
    ],
    { service: "unknown", url: "https://research.example.com/" }
  );

  assert.equal(selection.status, "unavailable");
});

test("background routing falls back when origin/service leaves multiple candidates", async () => {
  const { worker } = await importWorker();

  const selection = worker.__testing.selectAiInputAgent(
    [
      agent({ service: "chatgpt", url: "https://chatgpt.com/c/one", connectedAt: 1 }),
      agent({ service: "chatgpt", url: "https://chatgpt.com/c/two", connectedAt: 2 })
    ],
    { service: "chatgpt", url: "https://chatgpt.com/c/target" }
  );

  assert.equal(selection.status, "ambiguous");
});

test("background routing does not use a regular tab exact URL without target binding", async () => {
  const { worker } = await importWorker();

  const selection = worker.__testing.selectAiInputAgent(
    [
      agent({ service: "chatgpt", url: "https://chatgpt.com/c/target", tabId: 10, connectedAt: 1 })
    ],
    { service: "chatgpt", url: "https://chatgpt.com/c/target" }
  );

  assert.equal(selection.status, "ambiguous");
});

test("background routing can use a unique side-panel frame for the requested service origin", async () => {
  const { worker } = await importWorker();

  const selection = worker.__testing.selectAiInputAgent(
    [
      agent({ service: "chatgpt", url: "https://chatgpt.com/c/target", connectedAt: 1 }),
      agent({ service: "claude", url: "https://claude.ai/", connectedAt: 2 })
    ],
    { service: "chatgpt", url: "https://chatgpt.com/c/target" }
  );

  assert.equal(selection.status, "matched");
  assert.equal(selection.agent.url, "https://chatgpt.com/c/target");
});

test("background routing can use the saved fallback window tab", async () => {
  const { worker } = await importWorker();

  const selection = worker.__testing.selectAiInputAgent(
    [
      agent({ service: "chatgpt", url: "https://chatgpt.com/c/target", tabId: 10, connectedAt: 1 }),
      agent({ service: "chatgpt", url: "https://chatgpt.com/c/other", tabId: 11, connectedAt: 2 })
    ],
    {
      service: "chatgpt",
      url: "https://chatgpt.com/c/target",
      fallbackTabId: 10,
      fallbackUrl: "https://chatgpt.com/"
    }
  );

  assert.equal(selection.status, "matched");
  assert.equal(selection.agent.url, "https://chatgpt.com/c/target");
});

test("ensureOffscreenDocument serializes concurrent document creation", async () => {
  let createCalls = 0;
  let getContextsCalls = 0;
  let releaseGetContexts;
  const getContextsGate = new Promise((resolve) => {
    releaseGetContexts = resolve;
  });
  const { worker } = await importWorker({
    async getContexts() {
      getContextsCalls += 1;
      await getContextsGate;
      return [];
    },
    async createDocument() {
      createCalls += 1;
    }
  });

  const first = worker.__testing.ensureOffscreenDocument();
  const second = worker.__testing.ensureOffscreenDocument();
  const third = worker.__testing.ensureOffscreenDocument();
  await flushAsync();

  assert.equal(getContextsCalls, 1);
  releaseGetContexts();
  await Promise.all([first, second, third]);

  assert.equal(createCalls, 1);
});

async function importWorker(options = {}) {
  const chrome = createChromeMock(options);
  globalThis.chrome = chrome;
  const worker = await import(`../dist/background/service-worker.js?background-${Date.now()}-${importCounter++}`);
  await flushAsync();
  return { worker, chrome };
}

function agent(overrides) {
  return {
    port: {},
    service: "unknown",
    url: "",
    senderUrl: "",
    connectedAt: 0,
    ...overrides
  };
}

function createChromeMock(options = {}) {
  const storageData = {};
  return {
    runtime: {
      onInstalled: createEvent(),
      onMessage: createEvent(),
      onConnect: createEvent(),
      getURL(path) {
        return `chrome-extension://anyside/${path}`;
      },
      getContexts: options.getContexts || (async () => []),
      async sendMessage() {
        return { ok: true };
      }
    },
    action: {
      async setBadgeText() {},
      async setBadgeBackgroundColor() {}
    },
    contextMenus: {
      onClicked: createEvent(),
      async removeAll() {},
      create() {}
    },
    declarativeNetRequest: {
      async updateEnabledRulesets() {}
    },
    offscreen: {
      createDocument: options.createDocument || (async () => {})
    },
    scripting: {
      async executeScript() {
        return [];
      }
    },
    sidePanel: {
      async setPanelBehavior() {},
      async open() {}
    },
    storage: {
      onChanged: createEvent(),
      local: {
        async get(keys) {
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, storageData[key]]));
          }
          if (typeof keys === "string") {
            return { [keys]: storageData[keys] };
          }
          return { ...storageData };
        },
        async set(values) {
          Object.assign(storageData, values);
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete storageData[key];
          }
        }
      }
    },
    tabs: {
      async query() {
        return [];
      },
      async create() {
        return {};
      },
      async update() {
        return {};
      }
    },
    windows: {
      onRemoved: createEvent(),
      async get() {
        return {};
      },
      async getLastFocused() {
        return {};
      },
      async create() {
        return {};
      },
      async update() {
        return {};
      }
    }
  };
}

function createEvent() {
  const listeners = new Set();
  return {
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    },
    hasListener(listener) {
      return listeners.has(listener);
    }
  };
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
