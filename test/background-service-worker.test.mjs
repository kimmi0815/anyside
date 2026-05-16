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

test("isFromExtensionPage accepts extension-origin senders with no tab", async () => {
  const { worker } = await importWorker();
  const accepted = worker.__testing.isFromExtensionPage({
    id: "anyside",
    url: "chrome-extension://anyside/src/sidepanel/index.html"
  });
  assert.equal(accepted, true);
});

test("isFromExtensionPage rejects senders that report a tab (content scripts)", async () => {
  const { worker } = await importWorker();
  const rejected = worker.__testing.isFromExtensionPage({
    id: "anyside",
    url: "chrome-extension://anyside/src/sidepanel/index.html",
    tab: { id: 1 }
  });
  assert.equal(rejected, false);
});

test("isFromExtensionPage rejects mismatched extension ids", async () => {
  const { worker } = await importWorker();
  const rejected = worker.__testing.isFromExtensionPage({
    id: "evil-extension",
    url: "chrome-extension://evil-extension/page.html"
  });
  assert.equal(rejected, false);
});

test("isFromExtensionPage rejects senders without an extension URL", async () => {
  const { worker } = await importWorker();
  const rejected = worker.__testing.isFromExtensionPage({
    id: "anyside",
    url: "https://chatgpt.com/"
  });
  assert.equal(rejected, false);
});

test("isAllowedFallbackUrl accepts https and http://localhost URLs", async () => {
  const { worker } = await importWorker();
  const allow = worker.__testing.isAllowedFallbackUrl;
  assert.equal(allow("https://chatgpt.com/c/abc"), true);
  assert.equal(allow("https://example.com/"), true);
  assert.equal(allow("http://localhost:3000/"), true);
  assert.equal(allow("http://127.0.0.1:8080/"), true);
});

test("isAllowedFallbackUrl rejects unsafe and malformed URLs", async () => {
  const { worker } = await importWorker();
  const allow = worker.__testing.isAllowedFallbackUrl;
  assert.equal(allow("javascript:alert(1)"), false);
  assert.equal(allow("data:text/html,<script>alert(1)</script>"), false);
  assert.equal(allow("file:///etc/passwd"), false);
  assert.equal(allow("chrome://settings/"), false);
  assert.equal(allow("chrome-extension://anyside/page.html"), false);
  assert.equal(allow("blob:https://example.com/abc"), false);
  assert.equal(allow("http://example.com/"), false);
  assert.equal(allow(""), false);
  assert.equal(allow(null), false);
  assert.equal(allow(undefined), false);
  assert.equal(allow(42), false);
  assert.equal(allow("::not a url"), false);
});

test("handleRuntimeMessage rejects senders that report a tab", async () => {
  const { worker } = await importWorker();
  const response = await worker.__testing.handleRuntimeMessage(
    { type: "OPEN_SIDE_PANEL" },
    {
      id: "anyside",
      url: "chrome-extension://anyside/src/sidepanel/index.html",
      tab: { id: 1, windowId: 2 }
    }
  );
  assert.deepEqual(response, { ok: false, error: "Forbidden." });
});

test("handleRuntimeMessage rejects senders with foreign extension ids", async () => {
  const { worker } = await importWorker();
  const response = await worker.__testing.handleRuntimeMessage(
    { type: "OPEN_SIDE_PANEL" },
    {
      id: "evil-extension",
      url: "chrome-extension://evil-extension/page.html"
    }
  );
  assert.deepEqual(response, { ok: false, error: "Forbidden." });
});

test("handleRuntimeMessage OPEN_FALLBACK_WINDOW rejects unsafe URLs", async () => {
  const { worker } = await importWorker();
  const sender = {
    id: "anyside",
    url: "chrome-extension://anyside/src/sidepanel/index.html"
  };
  const cases = [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "chrome://settings/",
    "blob:https://example.com/abc",
    "",
    42,
    null
  ];
  for (const url of cases) {
    const response = await worker.__testing.handleRuntimeMessage(
      { type: "OPEN_FALLBACK_WINDOW", url },
      sender
    );
    assert.equal(response.ok, false, `expected ${JSON.stringify(url)} to be rejected`);
    assert.equal(response.error, "Invalid URL.");
  }
});

test("handleRuntimeMessage OPEN_FALLBACK_WINDOW accepts https and localhost URLs", async () => {
  const created = [];
  const { worker } = await importWorker({
    windows: {
      async create(options) {
        created.push(options.url);
        return { id: 99 };
      }
    }
  });
  const sender = {
    id: "anyside",
    url: "chrome-extension://anyside/src/sidepanel/index.html"
  };
  const response = await worker.__testing.handleRuntimeMessage(
    { type: "OPEN_FALLBACK_WINDOW", url: "https://chatgpt.com/" },
    sender
  );
  assert.equal(response.ok, true);
  assert.deepEqual(created, ["https://chatgpt.com/"]);
});

test("AI agent connect uses port.sender.url, ignoring message-supplied url override", async () => {
  const { worker, chrome } = await importWorker();
  const port = createMockPort({
    name: "ai-input-agent",
    sender: {
      url: "https://chatgpt.com/c/honest-tab",
      tab: { id: 7, windowId: 1 },
      frameId: 0
    }
  });
  chrome.runtime.onConnect.dispatch(port);
  port.onMessage.dispatch({
    type: "AI_AGENT_READY",
    service: "claude",
    url: "https://attacker.example.com/"
  });

  const agents = worker.__testing.getRegisteredAgents();
  assert.equal(agents.length, 1);
  assert.equal(agents[0].service, "chatgpt");
  assert.equal(agents[0].url, "https://chatgpt.com/c/honest-tab");
  assert.equal(agents[0].senderUrl, "https://chatgpt.com/c/honest-tab");
});

test("AI agent connect disconnects when port.sender.url is missing", async () => {
  const { worker, chrome } = await importWorker();
  const port = createMockPort({
    name: "ai-input-agent",
    sender: { tab: { id: 7 } }
  });
  chrome.runtime.onConnect.dispatch(port);
  port.onMessage.dispatch({
    type: "AI_AGENT_READY",
    service: "chatgpt",
    url: "https://chatgpt.com/"
  });

  assert.equal(worker.__testing.getRegisteredAgents().length, 0);
  assert.equal(port.disconnected, true);
});

test("AI agent connect disconnects when sender URL maps to an unknown service", async () => {
  const { worker, chrome } = await importWorker();
  const port = createMockPort({
    name: "ai-input-agent",
    sender: {
      url: "https://example.com/",
      tab: { id: 5 }
    }
  });
  chrome.runtime.onConnect.dispatch(port);
  port.onMessage.dispatch({
    type: "AI_AGENT_READY",
    service: "chatgpt",
    url: "https://chatgpt.com/"
  });

  assert.equal(worker.__testing.getRegisteredAgents().length, 0);
  assert.equal(port.disconnected, true);
});

test("AI agent connect ignores ports with a non ai-input-agent name", async () => {
  const { worker, chrome } = await importWorker();
  const port = createMockPort({
    name: "some-other-port",
    sender: { url: "https://chatgpt.com/", tab: { id: 1 } }
  });
  chrome.runtime.onConnect.dispatch(port);
  port.onMessage.dispatch({ type: "AI_AGENT_READY" });
  assert.equal(worker.__testing.getRegisteredAgents().length, 0);
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
      id: "anyside",
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
      async create(createInfo) {
        if (options.windows?.create) {
          return options.windows.create(createInfo);
        }
        return {};
      },
      async update() {
        return {};
      }
    }
  };
  return chrome;
}

function createMockPort({ name, sender }) {
  const port = {
    name,
    sender,
    onMessage: createEvent(),
    onDisconnect: createEvent(),
    disconnected: false,
    disconnect() {
      port.disconnected = true;
      port.onDisconnect.dispatch();
    },
    postMessage() {}
  };
  return port;
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
    },
    dispatch(...args) {
      for (const listener of listeners) {
        listener(...args);
      }
    }
  };
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
