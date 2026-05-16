import assert from "node:assert/strict";
import { test } from "node:test";

import { FRAME_COMPATIBILITY_DOMAINS } from "../dist/shared/presets.js";

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

test("frame compatibility session creates and removes a scoped session rule", async () => {
  const sessionUpdates = [];
  const { worker } = await importWorker({
    async updateSessionRules(update) {
      sessionUpdates.push(update);
    }
  });
  sessionUpdates.length = 0;

  const sessionId = await worker.__testing.startFrameCompatibilitySession("chatgpt", "https://chatgpt.com/", true);
  await worker.__testing.endFrameCompatibilitySession(sessionId);

  assert.equal(sessionUpdates.length, 2);
  assert.deepEqual(sessionUpdates[0].removeRuleIds, [1001]);
  assert.equal(sessionUpdates[0].addRules.length, 1);
  assert.deepEqual(sessionUpdates[0].addRules[0].condition.requestDomains.sort(), [...FRAME_COMPATIBILITY_DOMAINS].sort());
  assert.deepEqual(sessionUpdates[1], { removeRuleIds: [1001], addRules: [] });
});

test("startup recovery disables static ruleset and clears session rules", async () => {
  const rulesetUpdates = [];
  const sessionUpdates = [];
  await importWorker({
    async updateEnabledRulesets(update) {
      rulesetUpdates.push(update);
    },
    async updateSessionRules(update) {
      sessionUpdates.push(update);
    }
  });

  assert.deepEqual(rulesetUpdates.at(-1), {
    enableRulesetIds: [],
    disableRulesetIds: ["allow_framing_ai_sites"]
  });
  assert.deepEqual(sessionUpdates.at(-1), { removeRuleIds: [1001], addRules: [] });
});

test("disabled and non-built-in frame compatibility sessions are no-ops", async () => {
  const sessionUpdates = [];
  const { worker } = await importWorker({
    async updateSessionRules(update) {
      sessionUpdates.push(update);
    }
  });
  sessionUpdates.length = 0;

  const disabledSessionId = await worker.__testing.startFrameCompatibilitySession("chatgpt", "https://chatgpt.com/", false);
  const customSessionId = await worker.__testing.startFrameCompatibilitySession("custom:research", "https://research.example.com/", true);
  await worker.__testing.endFrameCompatibilitySession(disabledSessionId);
  await worker.__testing.endFrameCompatibilitySession(customSessionId);

  assert.deepEqual(sessionUpdates, []);
});

test("frame compatibility rule is side-panel sub-frame scoped", async () => {
  const { worker } = await importWorker();
  const rule = worker.__testing.createFrameCompatibilitySessionRule();

  assert.deepEqual(rule.condition.resourceTypes, ["sub_frame"]);
  assert.equal(rule.condition.resourceTypes.includes("main_frame"), false);
  assert.deepEqual(rule.condition.tabIds, [-1]);
  assert.deepEqual(rule.condition.initiatorDomains, ["anyside"]);
  assert.equal(rule.condition.requestDomains.includes("research.example.com"), false);
});

test("session rule failure fails closed without enabling the static ruleset", async () => {
  const rulesetUpdates = [];
  let rejectSessionRules = false;
  const { worker, chrome } = await importWorker({
    async updateEnabledRulesets(update) {
      rulesetUpdates.push(update);
    },
    async updateSessionRules() {
      if (rejectSessionRules) {
        throw new Error("session rules rejected");
      }
    }
  });
  rulesetUpdates.length = 0;
  rejectSessionRules = true;

  const before = await chrome.storage.local.get("anyside.settings");
  await assert.rejects(
    () => worker.__testing.startFrameCompatibilitySession("chatgpt", "https://chatgpt.com/", true),
    /session rules rejected/
  );
  const during = await chrome.storage.local.get("anyside.settings");

  assert.deepEqual(during, before);
  assert.deepEqual(rulesetUpdates, []);
  assert.equal(chrome.__enabledStaticRulesets.has("allow_framing_ai_sites"), false);
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
  const enabledStaticRulesets = new Set();
  const chrome = {
    runtime: {
      id: "anyside",
      onInstalled: createEvent(),
      onStartup: createEvent(),
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
      async updateEnabledRulesets(update) {
        for (const id of update.disableRulesetIds ?? []) {
          enabledStaticRulesets.delete(id);
        }
        for (const id of update.enableRulesetIds ?? []) {
          enabledStaticRulesets.add(id);
        }
        if (options.updateEnabledRulesets) {
          await options.updateEnabledRulesets(update);
        }
      },
      updateSessionRules: options.updateSessionRules || (async () => {})
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
      TAB_ID_NONE: -1,
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
  chrome.__enabledStaticRulesets = enabledStaticRulesets;
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
