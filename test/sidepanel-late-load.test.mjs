import assert from "node:assert/strict";
import { test } from "node:test";

import { PENDING_CONTEXT_SHELF_ITEMS_KEY } from "../dist/shared/contextShelfSession.js";

test("side panel hides fallback when the iframe loads after the normal timeout", async () => {
  const scheduler = createScheduler();
  const document = createSidepanelDocument();
  const storageData = {};

  globalThis.HTMLElement = FakeElement;
  globalThis.Element = FakeElement;
  globalThis.Node = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.window = {
    location: { search: "" },
    addEventListener() {},
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
    delete globalThis.Element;
    delete globalThis.Node;
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
  globalThis.Element = FakeElement;
  globalThis.Node = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.window = {
    location: { search: "" },
    addEventListener() {},
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
    delete globalThis.Element;
    delete globalThis.Node;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLDetailsElement;
    delete globalThis.HTMLIFrameElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLTableSectionElement;
  }
});

test("side panel service switcher loads registered services and custom URLs", async () => {
  const scheduler = createScheduler();
  const document = createSidepanelDocument();
  const runtimeMessages = [];
  const storageData = {
    "anyside.settings": {
      defaultPresetId: "chatgpt",
      activePresetId: "chatgpt",
      customUrls: [
        {
          id: "research",
          label: "Research",
          url: "https://research.example.com/",
          createdAt: 1
        }
      ],
      lastUrlByPreset: {
        chatgpt: "https://chatgpt.com/",
        claude: "https://claude.ai/",
        gemini: "https://gemini.google.com/",
        perplexity: "https://www.perplexity.ai/",
        notebooklm: "https://notebooklm.google.com/",
        custom: "",
        "custom:research": "https://research.example.com/"
      },
      serviceOrder: ["claude", "chatgpt", "custom:research", "gemini", "perplexity", "notebooklm"],
      hiddenServiceIds: [
        "perplexity",
        "notebooklm",
        "grok",
        "copilot",
        "deepseek",
        "kimi",
        "minimax",
        "glm",
        "manus",
        "genspark"
      ],
      quickAccessConfigured: true,
      enableFrameHeaderRelaxation: false,
      frameHeaderRelaxationAcknowledged: false,
      diagnostics: {}
    }
  };

  globalThis.HTMLElement = FakeElement;
  globalThis.Element = FakeElement;
  globalThis.Node = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.window = {
    location: { search: "" },
    addEventListener() {},
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    setInterval: scheduler.setInterval,
    clearInterval: scheduler.clearInterval
  };
  globalThis.chrome = createChromeMock(storageData);
  globalThis.chrome.runtime.sendMessage = async (message) => {
    runtimeMessages.push(message);
    if (message.type === "START_FRAME_COMPATIBILITY_SESSION") {
      return { ok: true, frameCompatibilitySessionId: `session-${runtimeMessages.length}` };
    }
    return { ok: true };
  };

  try {
    await import(`../dist/sidepanel/main.js?service-switcher-${Date.now()}`);
    await flushAsync();

    assert.match(textTree(document.getElementById("serviceSwitcher")), /ChatGPT/);
    assert.match(textTree(document.getElementById("serviceSwitcher")), /Gemini/);
    assert.match(textTree(document.getElementById("serviceSwitcher")), /Research/);
    assert.doesNotMatch(textTree(document.getElementById("serviceSwitcher")), /Perplexity/);
    assert.doesNotMatch(textTree(document.getElementById("serviceSwitcher")), /Google Keep/);
    assert.deepEqual(
      document.getElementById("serviceSwitcher").children.map((child) => child.dataset.presetId),
      ["claude", "chatgpt", "custom:research", "gemini"]
    );
    assert.equal(document.getElementById("serviceSwitcher").children[0].dataset.presetId, "claude");
    assert.equal(document.getElementById("moreActionsButton").hidden, false);
    assert.equal(document.getElementById("moreActionsButton").attributes["aria-label"], "Open settings");
    assert.equal(document.getElementById("headerReloadButton").attributes["aria-label"], "Reload current service");
    assert.deepEqual(runtimeMessages[0], {
      type: "START_FRAME_COMPATIBILITY_SESSION",
      presetId: "chatgpt",
      url: "https://chatgpt.com/",
      enabled: true
    });
    const chatgptFrame = document.getElementById("aiFrame");
    assert.equal(chatgptFrame.src, "https://chatgpt.com/");
    chatgptFrame.dispatch("load");

    const claudeButton = document
      .getElementById("serviceSwitcher")
      .children.find((child) => child.dataset.presetId === "claude");
    document.getElementById("serviceSwitcher").dispatch("click", { target: claudeButton });
    await flushAsync();
    scheduler.runByDelay(0);

    assert.equal(document.getElementById("aiFrame").src, "https://claude.ai/");
    assert.notEqual(document.getElementById("aiFrame"), chatgptFrame);
    assert.equal(chatgptFrame.hidden, true);
    assert.equal(storageData["anyside.settings"].defaultPresetId, "claude");
    assert.match(document.getElementById("statusText").textContent, /Loading Claude/);
    assert.equal(
      runtimeMessages.some(
        (message) =>
          message.type === "START_FRAME_COMPATIBILITY_SESSION" &&
          message.presetId === "claude" &&
          message.enabled === true
      ),
      true
    );

    const customButton = document
      .getElementById("serviceSwitcher")
      .children.find((child) => child.dataset.presetId === "custom:research");
    const messagesBeforeCustom = runtimeMessages.length;
    document.getElementById("serviceSwitcher").dispatch("click", { target: customButton });
    await flushAsync();
    await flushAsync();

    const customFrame = document.getElementById("aiFrame");
    assert.equal(customFrame.src, "https://research.example.com/");
    assert.equal(storageData["anyside.settings"].defaultPresetId, "custom:research");
    assert.equal(
      runtimeMessages
        .slice(messagesBeforeCustom)
        .some((message) => message.type === "START_FRAME_COMPATIBILITY_SESSION"),
      false
    );
    customFrame.dispatch("load");
    document.getElementById("headerReloadButton").dispatch("click");
    await flushAsync();
    assert.notEqual(document.getElementById("aiFrame"), customFrame);
    assert.equal(document.getElementById("aiFrame").src, "https://research.example.com/");
    assert.match(document.getElementById("statusText").textContent, /Loading Research/);

    const chatgptButton = document
      .getElementById("serviceSwitcher")
      .children.find((child) => child.dataset.presetId === "chatgpt");
    document.getElementById("serviceSwitcher").dispatch("click", { target: chatgptButton });
    await flushAsync();

    assert.equal(document.getElementById("aiFrame"), chatgptFrame);
    assert.equal(chatgptFrame.hidden, false);
    assert.equal(chatgptFrame.src, "https://chatgpt.com/");
    assert.match(document.getElementById("statusText").textContent, /ChatGPT restored/);

    document.getElementById("serviceSwitcher").dispatch("dragstart", {
      target: chatgptButton,
      dataTransfer: createDataTransfer()
    });
    document.getElementById("serviceSwitcher").dispatch("drop", {
      target: customButton,
      dataTransfer: createDataTransfer()
    });
    await flushAsync();

    assert.deepEqual(storageData["anyside.settings"].serviceOrder.slice(0, 3), ["claude", "custom:research", "chatgpt"]);

    document.getElementById("serviceSwitcher").dispatch("contextmenu", {
      target: customButton,
      preventDefault() {}
    });
    assert.equal(document.getElementById("serviceMenu").hidden, false);
    document.getElementById("hideServiceButton").dispatch("click");
    await flushAsync();

    assert.equal(storageData["anyside.settings"].hiddenServiceIds.includes("custom:research"), true);
    assert.doesNotMatch(textTree(document.getElementById("serviceSwitcher")), /Research/);
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.HTMLElement;
    delete globalThis.Element;
    delete globalThis.Node;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLDetailsElement;
    delete globalThis.HTMLIFrameElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLTableSectionElement;
  }
});

test("side panel composer menus close from toggles and the dismiss layer", async () => {
  const scheduler = createScheduler();
  const document = createSidepanelDocument();
  const storageData = {};

  globalThis.HTMLElement = FakeElement;
  globalThis.Element = FakeElement;
  globalThis.Node = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLImageElement = FakeImageElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.window = {
    location: { search: "" },
    addEventListener() {},
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    setInterval: scheduler.setInterval,
    clearInterval: scheduler.clearInterval
  };
  globalThis.chrome = createChromeMock(storageData);

  try {
    await import(`../dist/sidepanel/main.js?composer-close-${Date.now()}`);
    await flushAsync();

    const toolbar = document.getElementById("composerToolbar");
    const composerActions = document.getElementById("composerActions");
    const promptPalette = document.getElementById("promptPalette");
    const contextPopover = document.getElementById("contextPopover");
    const dismissLayer = document.getElementById("dismissLayer");

    assert.equal(toolbar.dataset.expanded, "false");
    assert.equal(composerActions.attributes["aria-hidden"], "false");

    document.getElementById("promptButton").dispatch("click");
    assert.equal(promptPalette.hidden, false);
    assert.equal(dismissLayer.hidden, false);

    document.getElementById("promptButton").dispatch("click");
    assert.equal(promptPalette.hidden, true);
    assert.equal(toolbar.dataset.expanded, "false");
    assert.equal(dismissLayer.hidden, true);

    document.getElementById("contextButton").dispatch("click");
    await flushAsync();
    assert.equal(contextPopover.hidden, false);
    assert.equal(dismissLayer.hidden, false);
    assert.equal(composerActions.attributes["aria-hidden"], "false");

    const selectionAction = findByDataset(document.getElementById("contextActions"), "mode", "selection");
    assert.equal(selectionAction.disabled, true);
    assert.equal(selectionAction.attributes["aria-disabled"], "true");
    document.getElementById("contextActions").dispatch("click", { target: selectionAction });
    await flushAsync();
    assert.equal(document.getElementById("composerToast").hidden, true);

    document.getElementById("contextButton").dispatch("click");
    assert.equal(contextPopover.hidden, true);
    assert.equal(toolbar.dataset.expanded, "false");

    document.getElementById("promptButton").dispatch("click");
    assert.equal(promptPalette.hidden, false);
    dismissLayer.dispatch("click");
    assert.equal(promptPalette.hidden, true);
    assert.equal(toolbar.dataset.expanded, "false");
    assert.equal(dismissLayer.hidden, true);
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.HTMLElement;
    delete globalThis.Element;
    delete globalThis.Node;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLDetailsElement;
    delete globalThis.HTMLIFrameElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLImageElement;
    delete globalThis.HTMLTableSectionElement;
  }
});

test("side panel does not request active tab context before a user action", async () => {
  const scheduler = createScheduler();
  const document = createSidepanelDocument();
  const storageData = {
    "composer.promptTemplates": [
      {
        id: "custom:context",
        title: "Context Prompt",
        category: "Test",
        body: "Page: {{title}}\n{{url}}\n{{selection}}",
        favorite: false,
        createdAt: 1,
        updatedAt: 1
      }
    ]
  };
  const runtimeMessages = [];

  globalThis.HTMLElement = FakeElement;
  globalThis.Element = FakeElement;
  globalThis.Node = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLImageElement = FakeImageElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.localStorage = createLocalStorage();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: {
      clipboard: {
        async writeText() {}
      }
    }
  });
  globalThis.window = {
    location: { search: "" },
    addEventListener() {},
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    setInterval: scheduler.setInterval,
    clearInterval: scheduler.clearInterval
  };
  globalThis.chrome = createChromeMock(storageData);
  globalThis.chrome.runtime.sendMessage = async (message) => {
    runtimeMessages.push(message);
    if (message.type === "GET_PAGE_CONTEXT") {
      return {
        ok: true,
        pageContext: {
          title: "Example page",
          url: "https://example.com/article",
          selection: "selected text",
          timestamp: 1
        }
      };
    }
    if (message.type === "INSERT_TEXT_TO_AI") {
      return {
        ok: true,
        insertResult: {
          success: true,
          method: "direct",
          service: message.service,
          reason: "inserted"
        }
      };
    }
    return { ok: true };
  };

  try {
    await import(`../dist/sidepanel/main.js?context-boundary-${Date.now()}`);
    await flushAsync();
    scheduler.runByDelay(0);
    document.getElementById("aiFrame").dispatch("load");

    assert.equal(runtimeMessages.some((message) => message.type === "GET_PAGE_CONTEXT"), false);

    document.getElementById("promptButton").dispatch("click");
    await flushAsync();
    const promptRow = document.getElementById("promptList").children[0];
    document.getElementById("promptList").dispatch("click", { target: promptRow });
    await flushAsync();

    assert.equal(runtimeMessages.filter((message) => message.type === "GET_PAGE_CONTEXT").length, 1);
    assert.equal(runtimeMessages.some((message) => message.type === "INSERT_TEXT_TO_AI"), true);
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.localStorage;
    delete globalThis.navigator;
    delete globalThis.window;
    delete globalThis.HTMLElement;
    delete globalThis.Element;
    delete globalThis.Node;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLDetailsElement;
    delete globalThis.HTMLIFrameElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLImageElement;
    delete globalThis.HTMLTableSectionElement;
  }
});

test("side panel prompt templates can use the current Prompt Draft", async () => {
  const scheduler = createScheduler();
  const document = createSidepanelDocument();
  const storageData = {
    "composer.promptTemplates": [
      {
        id: "custom:draft",
        title: "Use Draft",
        category: "Test",
        body: "Draft:\n{{draft}}",
        favorite: false,
        createdAt: 1,
        updatedAt: 1
      }
    ]
  };
  const runtimeMessages = [];
  const sessionStorage = createLocalStorage();
  sessionStorage.setItem("composer.promptDraft", "Draft paragraph");

  globalThis.HTMLElement = FakeElement;
  globalThis.Element = FakeElement;
  globalThis.Node = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLImageElement = FakeImageElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.localStorage = createLocalStorage();
  globalThis.sessionStorage = sessionStorage;
  globalThis.window = {
    location: { search: "" },
    addEventListener() {},
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    setInterval: scheduler.setInterval,
    clearInterval: scheduler.clearInterval
  };
  globalThis.chrome = createChromeMock(storageData);
  globalThis.chrome.runtime.sendMessage = async (message) => {
    runtimeMessages.push(message);
    if (message.type === "GET_PAGE_CONTEXT") {
      return { ok: true, pageContext: { title: "", url: "", selection: "", timestamp: 1 } };
    }
    if (message.type === "INSERT_TEXT_TO_AI") {
      return {
        ok: true,
        insertResult: {
          success: true,
          method: "direct",
          service: message.service,
          reason: "inserted"
        }
      };
    }
    return { ok: true };
  };

  try {
    await import(`../dist/sidepanel/main.js?draft-template-${Date.now()}`);
    await flushAsync();

    document.getElementById("promptButton").dispatch("click");
    await flushAsync();
    const promptRow = document.getElementById("promptList").children[0];
    document.getElementById("promptList").dispatch("click", { target: promptRow });
    await flushAsync();

    const insertMessage = runtimeMessages.find((message) => message.type === "INSERT_TEXT_TO_AI");
    assert.equal(insertMessage.text, "Draft:\nDraft paragraph");
    assert.equal(runtimeMessages.some((message) => message.type === "EXTRACT_ACTIVE_TAB_PAGE_TEXT"), false);
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
    delete globalThis.window;
    delete globalThis.HTMLElement;
    delete globalThis.Element;
    delete globalThis.Node;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLDetailsElement;
    delete globalThis.HTMLIFrameElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLImageElement;
    delete globalThis.HTMLTableSectionElement;
  }
});

test("side panel drains context-menu Shelf selections and copies all Shelf materials", async () => {
  const scheduler = createScheduler();
  const document = createSidepanelDocument();
  const storageData = {};
  const sessionData = {
    [PENDING_CONTEXT_SHELF_ITEMS_KEY]: [
      {
        id: "pending-selection",
        title: "Selection",
        subtitle: "Article title · docs.example.com",
        text: "Selected body text",
        createdAt: 1
      }
    ]
  };
  const copiedTexts = [];

  globalThis.HTMLElement = FakeElement;
  globalThis.Element = FakeElement;
  globalThis.Node = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLImageElement = FakeImageElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.localStorage = createLocalStorage();
  globalThis.sessionStorage = createLocalStorage();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: {
      clipboard: {
        async writeText(text) {
          copiedTexts.push(text);
        }
      }
    }
  });
  globalThis.window = {
    location: { search: "" },
    addEventListener() {},
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    setInterval: scheduler.setInterval,
    clearInterval: scheduler.clearInterval
  };
  globalThis.chrome = createChromeMock(storageData, sessionData);

  try {
    await import(`../dist/sidepanel/main.js?shelf-drain-${Date.now()}`);
    await flushAsync();

    assert.equal(sessionData[PENDING_CONTEXT_SHELF_ITEMS_KEY], undefined);
    assert.equal(document.getElementById("contextShelfPanel").hidden, false);
    assert.equal(document.getElementById("copyShelfButton").disabled, false);
    assert.match(textTree(document.getElementById("contextShelfList")), /Selected body text/);

    document.getElementById("copyShelfButton").dispatch("click");
    await flushAsync();

    assert.equal(copiedTexts.length, 1);
    assert.match(copiedTexts[0], /#1 Selection/);
    assert.match(copiedTexts[0], /Article title · docs\.example\.com/);
    assert.match(copiedTexts[0], /Selected body text/);
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
    delete globalThis.navigator;
    delete globalThis.window;
    delete globalThis.HTMLElement;
    delete globalThis.Element;
    delete globalThis.Node;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLDetailsElement;
    delete globalThis.HTMLIFrameElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLImageElement;
    delete globalThis.HTMLTableSectionElement;
  }
});

test("side panel header and footer chrome collapse and persist", async () => {
  const scheduler = createScheduler();
  const document = createSidepanelDocument();
  const storageData = {};

  globalThis.HTMLElement = FakeElement;
  globalThis.Element = FakeElement;
  globalThis.Node = FakeElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.HTMLDetailsElement = FakeElement;
  globalThis.HTMLIFrameElement = FakeIFrameElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLImageElement = FakeImageElement;
  globalThis.HTMLTableSectionElement = FakeElement;
  globalThis.document = document;
  globalThis.window = {
    location: { search: "" },
    addEventListener() {},
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    setInterval: scheduler.setInterval,
    clearInterval: scheduler.clearInterval
  };
  globalThis.chrome = createChromeMock(storageData);

  try {
    await import(`../dist/sidepanel/main.js?chrome-collapse-${Date.now()}`);
    await flushAsync();

    const app = document.getElementById("app");
    const headerToggle = document.getElementById("headerChromeToggleButton");
    const footerToggle = document.getElementById("footerChromeToggleButton");
    const toolbar = document.getElementById("composerToolbar");
    const promptPalette = document.getElementById("promptPalette");
    const dismissLayer = document.getElementById("dismissLayer");

    assert.equal(app.dataset.headerCollapsed, "false");
    assert.equal(app.dataset.footerCollapsed, "false");
    assert.equal(headerToggle.attributes["aria-label"], "Collapse header");
    assert.equal(footerToggle.attributes["aria-label"], "Collapse footer");

    headerToggle.dispatch("click");
    await flushAsync();

    assert.equal(storageData["anyside.settings"].sidePanelChrome.headerCollapsed, true);
    assert.equal(app.dataset.headerCollapsed, "true");
    assert.equal(document.getElementById("serviceSwitcher").attributes["aria-hidden"], "true");
    assert.equal(document.getElementById("headerReloadButton").attributes["aria-hidden"], "true");
    assert.equal(headerToggle.attributes["aria-label"], "Expand header");

    headerToggle.dispatch("click");
    await flushAsync();

    assert.equal(storageData["anyside.settings"].sidePanelChrome.headerCollapsed, false);
    assert.equal(app.dataset.headerCollapsed, "false");
    assert.equal(document.getElementById("headerReloadButton").attributes["aria-hidden"], "false");

    document.getElementById("promptButton").dispatch("click");
    assert.equal(promptPalette.hidden, false);
    assert.equal(dismissLayer.hidden, false);

    footerToggle.dispatch("click");
    await flushAsync();

    assert.equal(storageData["anyside.settings"].sidePanelChrome.footerCollapsed, true);
    assert.equal(app.dataset.footerCollapsed, "true");
    assert.equal(promptPalette.hidden, true);
    assert.equal(dismissLayer.hidden, true);
    assert.equal(toolbar.dataset.expanded, "false");
    assert.equal(document.getElementById("composerActions").attributes["aria-hidden"], "true");
    assert.equal(document.getElementById("moreActionsButton").attributes["aria-hidden"], "true");
    assert.equal(footerToggle.attributes["aria-label"], "Expand footer");

    footerToggle.dispatch("click");
    await flushAsync();

    assert.equal(storageData["anyside.settings"].sidePanelChrome.footerCollapsed, false);
    assert.equal(app.dataset.footerCollapsed, "false");
    assert.equal(document.getElementById("composerActions").attributes["aria-hidden"], "false");
    assert.equal(document.getElementById("moreActionsButton").attributes["aria-hidden"], "false");
    assert.equal(footerToggle.attributes["aria-label"], "Collapse footer");
  } finally {
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.HTMLElement;
    delete globalThis.Element;
    delete globalThis.Node;
    delete globalThis.HTMLButtonElement;
    delete globalThis.HTMLDetailsElement;
    delete globalThis.HTMLIFrameElement;
    delete globalThis.HTMLInputElement;
    delete globalThis.HTMLImageElement;
    delete globalThis.HTMLTableSectionElement;
  }
});


function createSidepanelDocument() {
  const document = new FakeDocument();
  const elementIds = [
    "app",
    "statusLive",
    "statusBanner",
    "statusBannerText",
    "statusText",
    "loadingSpinner",
    "elapsedText",
    "fallbackPanel",
    "fallbackServiceName",
    "fallbackTitleSuffix",
    "fallbackReason",
    "fallbackNote",
    "setupPanel",
    "frameDeck",
    "composerToast",
    "serviceSwitcher",
    "serviceMenu",
    "dismissLayer",
    "composerToolbar",
    "composerActions",
    "contextPopover",
    "contextSummary",
    "contextActions",
    "promptPalette",
    "promptList",
    "contextShelfPanel",
    "contextShelfTitle",
    "contextShelfList",
    "promptDraftPanel",
    "promptDraftTitle",
    "templateVariableList",
    "diagnosticsDetails",
    "diagnosticsTable"
  ];
  const buttonIds = [
    "headerReloadButton",
    "headerChromeToggleButton",
    "footerChromeToggleButton",
    "moreActionsButton",
    "hideServiceButton",
    "composerLauncherButton",
    "contextButton",
    "promptButton",
    "addContextToShelfButton",
    "sendContextToDraftButton",
    "shelfButton",
    "draftButton",
    "copyShelfButton",
    "clearShelfButton",
    "tryDraftButton",
    "insertDraftButton",
    "copyDraftButton",
    "clearDraftButton",
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
  document.register(new FakeInputElement("promptSearchInput", document));
  document.register(new FakeInputElement("promptDraftTextarea", document));
  document.register(new FakeInputElement("draftTargetSelect", document));
  document.getElementById("frameDeck").append(document.register(new FakeIFrameElement("aiFrame", document)));
  for (const id of [
    "statusBanner",
    "loadingSpinner",
    "elapsedText",
    "fallbackPanel",
    "setupPanel",
    "composerToast",
    "dismissLayer",
    "serviceMenu",
    "contextPopover",
    "promptPalette",
    "contextShelfPanel",
    "promptDraftPanel",
    "diagnosticsDetails"
  ]) {
    document.getElementById(id).hidden = true;
  }
  return document;
}

function createChromeMock(storageData, sessionData = {}) {
  const makeStorageArea = (data) => ({
    async get(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(keyList.map((key) => [key, data[key]]));
    },
    async set(values) {
      Object.assign(data, values);
    },
    async remove(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        delete data[key];
      }
    }
  });
  return {
    runtime: {
      openOptionsPage() {},
      async sendMessage() {
        return { ok: true };
      }
    },
    storage: {
      onChanged: { addListener() {} },
      local: makeStorageArea(storageData),
      session: makeStorageArea(sessionData)
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

function createDataTransfer() {
  return {
    data: {},
    dropEffect: "",
    effectAllowed: "",
    setData(type, value) {
      this.data[type] = value;
    },
    getData(type) {
      return this.data[type] || "";
    }
  };
}

function createLocalStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
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
    if (this.elements[id]?.id === id) {
      return this.elements[id];
    }

    const seen = new Set();
    const visit = (element) => {
      if (!element || seen.has(element)) {
        return null;
      }
      seen.add(element);
      if (element.id === id) {
        return element;
      }
      for (const child of element.children ?? []) {
        const found = visit(child);
        if (found) {
          return found;
        }
      }
      return null;
    };

    for (const element of Object.values(this.elements)) {
      const found = visit(element);
      if (found) {
        return found;
      }
    }
    return null;
  }

  createElement(tagName) {
    if (tagName === "button") {
      return new FakeButtonElement("", this);
    }
    if (tagName === "img") {
      return new FakeImageElement("", this);
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
        child.parentElement?.removeChild?.(child);
        child.parentElement = this;
      }
    }
    this.children.push(...children);
  }

  removeChild(child) {
    this.children = this.children.filter((item) => item !== child);
    if (child.parentElement === this) {
      child.parentElement = undefined;
    }
  }

  contains(target) {
    return target === this || this.children.some((child) => child === target || child.contains?.(target));
  }

  closest(selector) {
    if (selector === "button[data-preset-id]" && this instanceof FakeButtonElement && this.dataset.presetId) {
      return this;
    }
    if (selector === "button[data-mode]" && this instanceof FakeButtonElement && this.dataset.mode) {
      return this;
    }
    if (selector === "button[data-shelf-action][data-shelf-id]" && this instanceof FakeButtonElement && this.dataset.shelfAction && this.dataset.shelfId) {
      return this;
    }
    if (selector === "button[data-template-var]" && this instanceof FakeButtonElement && this.dataset.templateVar) {
      return this;
    }
    if (selector === "[data-template-id]" && this.dataset.templateId) {
      return this;
    }
    return this.parentElement?.closest?.(selector) ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      if (selector === "[data-dragging]" && element.dataset.dragging !== undefined) {
        matches.push(element);
      }
      for (const child of element.children) {
        visit(child);
      }
    };
    visit(this);
    return matches;
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

  remove() {
    this.parentElement?.removeChild(this);
    if (this.ownerDocument.elements[this.id] === this) {
      delete this.ownerDocument.elements[this.id];
    }
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

class FakeImageElement extends FakeElement {
  alt = "";
  src = "";
}

class FakeIFrameElement extends FakeElement {
  src = "";
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
