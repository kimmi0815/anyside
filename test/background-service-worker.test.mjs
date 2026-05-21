import assert from "node:assert/strict";
import { test } from "node:test";

import { PENDING_CONTEXT_SHELF_ITEMS_KEY } from "../dist/shared/contextShelfSession.js";
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

test("GET_PAGE_CONTEXT remains lightweight and does not include page body text", async () => {
  const scriptCalls = [];
  const { worker } = await importWorker({
    tabs: {
      async query(queryInfo) {
        return queryInfo.currentWindow
          ? [{ id: 12, title: "Fallback title", url: "https://example.com/article", windowId: 1 }]
          : [];
      }
    },
    scripting: {
      async executeScript(options) {
        scriptCalls.push(options);
        return [{
          result: {
            title: "Current title",
            url: "https://example.com/article",
            selection: "selected quote",
            timestamp: 123
          }
        }];
      }
    }
  });
  const response = await worker.__testing.handleRuntimeMessage(
    { type: "GET_PAGE_CONTEXT" },
    extensionSender()
  );

  assert.equal(response.ok, true);
  assert.deepEqual(response.pageContext, {
    title: "Current title",
    url: "https://example.com/article",
    selection: "selected quote",
    timestamp: 123
  });
  assert.equal(Object.hasOwn(response.pageContext, "pageText"), false);
  assert.equal(scriptCalls.length, 1);
  assert.deepEqual(scriptCalls[0].target, { tabId: 12 });
});

test("EXTRACT_ACTIVE_TAB_PAGE_TEXT injects only into the active tab and normalizes metadata", async () => {
  const scriptCalls = [];
  const longText = "x".repeat(30_010);
  const { worker } = await importWorker({
    tabs: {
      async query(queryInfo) {
        return queryInfo.currentWindow
          ? [{ id: 24, title: "Fallback title", url: "https://example.com/fallback", windowId: 1 }]
          : [];
      }
    },
    scripting: {
      async executeScript(options) {
        scriptCalls.push(options);
        return [{
          result: {
            title: "Extracted title",
            url: "https://docs.example.com/path",
            selection: "selected text",
            headings: ["Intro", "A".repeat(350)],
            articleText: longText,
            mainText: "main text",
            bodyText: "body text",
            documentText: "document text"
          }
        }];
      }
    }
  });
  const response = await worker.__testing.handleRuntimeMessage(
    { type: "EXTRACT_ACTIVE_TAB_PAGE_TEXT" },
    extensionSender()
  );

  assert.equal(response.ok, true);
  assert.equal(response.extractedPageContext.title, "Extracted title");
  assert.equal(response.extractedPageContext.url, "https://docs.example.com/path");
  assert.equal(response.extractedPageContext.selection, "selected text");
  assert.equal(response.extractedPageContext.domain, "docs.example.com");
  assert.deepEqual(response.extractedPageContext.headings, ["Intro", "A".repeat(300)]);
  assert.equal(response.extractedPageContext.pageText.length, 30_000);
  assert.equal(response.extractedPageContext.source, "article");
  assert.deepEqual(response.extractedPageContext.truncated, { headings: true, pageText: true });
  assert.equal(scriptCalls.length, 1);
  assert.deepEqual(scriptCalls[0].target, { tabId: 24 });
  assert.equal(scriptCalls[0].func, worker.__testing.capturePageContentSnapshotInPage);
});

test("EXTRACT_ACTIVE_TAB_PAGE_TEXT falls back from empty article to main text", async () => {
  const { worker } = await importWorker({
    tabs: {
      async query(queryInfo) {
        return queryInfo.currentWindow
          ? [{ id: 25, title: "Fallback title", url: "https://example.com/read", windowId: 1 }]
          : [];
      }
    },
    scripting: {
      async executeScript() {
        return [{
          result: {
            title: "Fallback article",
            url: "https://example.com/read",
            headings: [],
            articleText: "",
            mainText: "Main article text ".repeat(20),
            bodyText: "Body page text ".repeat(20),
            documentText: "Document page text ".repeat(20)
          }
        }];
      }
    }
  });
  const response = await worker.__testing.handleRuntimeMessage(
    { type: "EXTRACT_ACTIVE_TAB_PAGE_TEXT" },
    extensionSender()
  );

  assert.equal(response.ok, true);
  assert.equal(response.extractedPageContext.source, "main");
  assert.match(response.extractedPageContext.pageText, /Main article text/);
});

test("EXTRACT_ACTIVE_TAB_PAGE_TEXT falls back without injection on restricted tabs", async () => {
  let executeScriptCalled = false;
  const { worker } = await importWorker({
    tabs: {
      async query(queryInfo) {
        return queryInfo.currentWindow
          ? [{ id: 31, title: "Settings", url: "chrome://settings/", windowId: 1 }]
          : [];
      }
    },
    scripting: {
      async executeScript() {
        executeScriptCalled = true;
        return [];
      }
    }
  });
  const response = await worker.__testing.handleRuntimeMessage(
    { type: "EXTRACT_ACTIVE_TAB_PAGE_TEXT" },
    extensionSender()
  );

  assert.equal(response.ok, true);
  assert.equal(executeScriptCalled, false);
  assert.deepEqual(response.extractedPageContext, {
    title: "Settings",
    url: "chrome://settings/",
    domain: "settings",
    headings: [],
    pageText: "",
    selection: "",
    timestamp: response.extractedPageContext.timestamp,
    source: "fallback",
    truncated: { headings: false, pageText: false }
  });
});

test("capturePageContentSnapshotInPage captures article text and removes page chrome noise", async () => {
  const { worker } = await importWorker();
  const previousDocument = globalThis.document;
  const previousLocation = globalThis.location;
  const previousWindow = globalThis.window;
  globalThis.document = createExtractionDocument();
  globalThis.location = {
    href: "https://example.com/read",
    hostname: "example.com"
  };
  globalThis.window = {
    getSelection() {
      return { toString: () => "selected article text" };
    }
  };

  try {
    const result = worker.__testing.capturePageContentSnapshotInPage({
      maxCandidateTextLength: 70,
      maxHeadingCount: 2,
      maxHeadingLength: 18
    });

    assert.equal(result.title, "Readable page");
    assert.equal(result.url, "https://example.com/read");
    assert.equal(result.selection, "selected article text");
    assert.deepEqual(result.headings, ["Article Heading", "A very long section heading that should clamp".slice(0, 18)]);
    assert.match(result.articleText, /Article Heading/);
    assert.match(result.articleText, /First paragraph with extra spaces\./);
    assert.doesNotMatch(result.articleText, /Cookie banner|Navigation|Footer|alert/);
    assert.equal(result.articleText.length, 70);
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
    if (previousLocation === undefined) {
      delete globalThis.location;
    } else {
      globalThis.location = previousLocation;
    }
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
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

test("background context menus keep existing actions and add selection to Shelf", async () => {
  const { chrome } = await importWorker();

  chrome.runtime.onInstalled.dispatch();
  await flushAsync();
  await flushAsync();

  assert.deepEqual(chrome.__createdContextMenus.map((menu) => menu.id), [
    "ask-anyside-selection",
    "add-selection-to-anyside-shelf",
    "open-anyside"
  ]);
  assert.deepEqual(chrome.__createdContextMenus.map((menu) => menu.contexts), [
    ["selection"],
    ["selection"],
    ["all"]
  ]);
  assert.equal(chrome.__createdContextMenus[0].title, "Ask anyside about selection");
  assert.equal(chrome.__createdContextMenus[1].title, "Add selection to Context Shelf");
});

test("background selection Shelf menu queues selected text without clipboard copy", async () => {
  const openedPanels = [];
  let offscreenCreateCalls = 0;
  const { chrome } = await importWorker({
    async createDocument() {
      offscreenCreateCalls += 1;
    },
    sidePanel: {
      async open(openOptions) {
        openedPanels.push(openOptions);
      }
    }
  });

  chrome.contextMenus.onClicked.dispatch(
    {
      menuItemId: "add-selection-to-anyside-shelf",
      selectionText: "  Important selected text  "
    },
    {
      id: 4,
      windowId: 9,
      title: "Article title",
      url: "https://docs.example.com/article"
    }
  );
  await flushAsync();

  const pending = chrome.__sessionStorageData[PENDING_CONTEXT_SHELF_ITEMS_KEY];
  assert.equal(offscreenCreateCalls, 0);
  assert.deepEqual(openedPanels, [{ windowId: 9 }]);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].title, "Selection");
  assert.equal(pending[0].subtitle, "Article title · docs.example.com");
  assert.equal(pending[0].text, "Important selected text");
});

async function importWorker(options = {}) {
  const chrome = createChromeMock(options);
  globalThis.chrome = chrome;
  await import(`../dist/background/service-worker.js?background-${Date.now()}-${importCounter++}`);
  await flushAsync();
  const worker = { __testing: globalThis.__anysideBackgroundTesting };
  return { worker, chrome };
}

function extensionSender() {
  return {
    id: "anyside",
    url: "chrome-extension://anyside/src/sidepanel/index.html"
  };
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
  const sessionStorageData = {};
  const createdContextMenus = [];
  const enabledStaticRulesets = new Set();
  const makeStorageArea = (data) => ({
    async get(keys) {
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, data[key]]));
      }
      if (typeof keys === "string") {
        return { [keys]: data[keys] };
      }
      return { ...data };
    },
    async set(values) {
      if (chrome.__failStorageSet) {
        throw new Error("storage set failed");
      }
      Object.assign(data, values);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete data[key];
      }
    }
  });
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
      async removeAll() {
        createdContextMenus.length = 0;
      },
      create(properties) {
        createdContextMenus.push(properties);
      }
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
      async executeScript(details) {
        if (options.scripting?.executeScript) {
          return options.scripting.executeScript(details);
        }
        return [];
      }
    },
    sidePanel: {
      async setPanelBehavior() {},
      async open(openOptions) {
        if (options.sidePanel?.open) {
          await options.sidePanel.open(openOptions);
        }
      }
    },
    storage: {
      onChanged: createEvent(),
      local: makeStorageArea(storageData),
      session: makeStorageArea(sessionStorageData)
    },
    tabs: {
      TAB_ID_NONE: -1,
      async query(queryInfo) {
        if (options.tabs?.query) {
          return options.tabs.query(queryInfo);
        }
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
  chrome.__createdContextMenus = createdContextMenus;
  chrome.__storageData = storageData;
  chrome.__sessionStorageData = sessionStorageData;
  return chrome;
}

function createExtractionDocument() {
  const article = new FakeElement("article", "", [
    new FakeElement("header", "Cookie banner"),
    new FakeElement("h1", "Article Heading"),
    new FakeElement("p", "First   paragraph with     extra spaces."),
    new FakeElement("nav", "Navigation"),
    new FakeElement("h2", "A very long section heading that should clamp"),
    new FakeElement("p", "Second paragraph with enough text to exceed the small page text limit used by this test."),
    new FakeElement("h3", "Third heading"),
    new FakeElement("script", "alert('nope')"),
    new FakeElement("footer", "Footer")
  ]);
  const main = new FakeElement("main", "Main fallback text");
  const body = new FakeElement("body", "", [article, main]);
  return new FakeDocument("Readable page", body);
}

class FakeDocument {
  constructor(title, body) {
    this.title = title;
    this.body = body;
    this.documentElement = new FakeElement("html", "", [body]);
  }

  querySelector(selector) {
    return this.documentElement.find(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }
}

class FakeElement {
  constructor(tagName, text = "", children = []) {
    this.tagName = tagName;
    this.text = text;
    this.children = children;
    this.removed = false;
  }

  cloneNode() {
    return new FakeElement(
      this.tagName,
      this.text,
      this.children.map((child) => child.cloneNode(true))
    );
  }

  querySelectorAll(selector) {
    const selectors = selector.split(",").map((item) => item.trim());
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selectors.includes(child.tagName)) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  find(selector) {
    if (this.tagName === selector) {
      return this;
    }
    for (const child of this.children) {
      const found = child.find(selector);
      if (found) {
        return found;
      }
    }
    return null;
  }

  remove() {
    this.removed = true;
  }

  get textContent() {
    if (this.removed) {
      return "";
    }
    return [this.text, ...this.children.map((child) => child.textContent)]
      .filter(Boolean)
      .join("\n");
  }
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
