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
      fallbackUrl: "https://chatgpt.com/c/target"
    }
  );

  assert.equal(selection.status, "matched");
  assert.equal(selection.agent.url, "https://chatgpt.com/c/target");
});

test("background routing prefers an exact side-panel frame over a saved fallback window", async () => {
  const { worker } = await importWorker();

  const selection = worker.__testing.selectAiInputAgent(
    [
      agent({ service: "chatgpt", url: "https://chatgpt.com/c/target", connectedAt: 1 }),
      agent({ service: "chatgpt", url: "https://chatgpt.com/c/target", tabId: 10, connectedAt: 2 })
    ],
    {
      service: "chatgpt",
      url: "https://chatgpt.com/c/target",
      fallbackTabId: 10,
      fallbackUrl: "https://chatgpt.com/c/target"
    }
  );

  assert.equal(selection.status, "matched");
  assert.equal(selection.agent.tabId, undefined);
});

test("background routing does not use a fallback tab on same origin with a different URL", async () => {
  const { worker } = await importWorker();

  const selection = worker.__testing.selectAiInputAgent(
    [
      agent({ service: "chatgpt", url: "https://chatgpt.com/c/other", tabId: 10, connectedAt: 1 })
    ],
    {
      service: "chatgpt",
      url: "https://chatgpt.com/c/target",
      fallbackTabId: 10,
      fallbackUrl: "https://chatgpt.com/c/other"
    }
  );

  assert.equal(selection.status, "ambiguous");
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

test("DNR enable rolls back the ruleset when settings save fails", async () => {
  const updates = [];
  const { worker, chrome } = await importWorker({
    async updateEnabledRulesets(update) {
      updates.push(update);
    }
  });

  chrome.__failStorageSet = true;
  await assert.rejects(() => worker.__testing.setDnrEnabled(true, "change-test"));

  assert.deepEqual(updates.slice(-2), [
    { enableRulesetIds: ["allow_framing_ai_sites"], disableRulesetIds: [] },
    { enableRulesetIds: [], disableRulesetIds: ["allow_framing_ai_sites"] }
  ]);
});

test("DNR diagnostic session does not persist settings and restores stored mode", async () => {
  const updates = [];
  const { worker, chrome } = await importWorker({
    async updateEnabledRulesets(update) {
      updates.push(update);
    }
  });

  const before = await chrome.storage.local.get("anyside.settings");
  const sessionId = await worker.__testing.startDnrDiagnosticSession(true);
  const during = await chrome.storage.local.get("anyside.settings");
  await worker.__testing.endDnrDiagnosticSession(sessionId);

  assert.deepEqual(during, before);
  assert.deepEqual(updates.slice(-2), [
    { enableRulesetIds: ["allow_framing_ai_sites"], disableRulesetIds: [] },
    { enableRulesetIds: [], disableRulesetIds: ["allow_framing_ai_sites"] }
  ]);
});

async function importWorker(options = {}) {
  const chrome = createChromeMock(options);
  globalThis.chrome = chrome;
  await import(`../dist/background/service-worker.js?background-${Date.now()}-${importCounter++}`);
  await flushAsync();
  const worker = { __testing: globalThis.__anysideBackgroundTesting };
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
  const chrome = {
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
      updateEnabledRulesets: options.updateEnabledRulesets || (async () => {})
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
          if (chrome.__failStorageSet) {
            throw new Error("storage set failed");
          }
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
  return chrome;
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
