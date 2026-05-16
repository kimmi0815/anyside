import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { defaultSettings, getSettings, normalizeSettings, SETTINGS_KEY } from "../dist/shared/storage.js";

const LEGACY_SETTINGS_KEY = "aiSidecar.settings";
const BUILT_IN_ORDER = [
  "chatgpt",
  "gemini",
  "claude",
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
];
const DEFAULT_HIDDEN = [
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
];

afterEach(() => {
  delete globalThis.chrome;
});

test("normalizeSettings keeps valid custom settings and drops invalid entries", () => {
  const settings = normalizeSettings({
    defaultPresetId: "custom:docs",
    activePresetId: "custom:missing",
    customUrls: [
      {
        id: "docs",
        label: " Docs ",
        url: "docs.example.com",
        iconUrl: "https://docs.example.com/favicon.ico",
        iconUpdatedAt: 12,
        createdAt: 7
      },
      {
        id: "docs",
        label: "Duplicate",
        url: "duplicate.example.com",
        createdAt: 8
      },
      {
        id: "bad",
        label: "Bad",
        url: "ftp://example.com",
        createdAt: 9
      }
    ],
    lastUrlByPreset: {
      chatgpt: "",
      keep: "https://keep.google.com/",
      custom: "ftp://example.com",
      "custom:docs": "docs.example.com/chat"
    },
    serviceOrder: ["keep", "custom:docs", "chatgpt", "custom:missing", "claude"],
    hiddenServiceIds: ["gemini", "keep", "custom:missing"],
    enableFrameHeaderRelaxation: false,
    frameHeaderRelaxationAcknowledged: false,
    diagnostics: {
      valid: {
        presetId: "chatgpt",
        url: "https://chatgpt.com/",
        dnrEnabled: true,
        status: "loaded",
        startedAt: 100,
        finishedAt: 200,
        message: "ok"
      },
      invalid: {
        presetId: "custom:docs",
        url: "https://docs.example.com/",
        dnrEnabled: true,
        status: "loaded",
        startedAt: 100
      }
    }
  });

  assert.equal(settings.defaultPresetId, "custom:docs");
  assert.equal(settings.activePresetId, "custom:docs");
  assert.deepEqual(settings.customUrls, [
    {
      id: "docs",
      label: "Docs",
      url: "https://docs.example.com/",
      iconUrl: "https://docs.example.com/favicon.ico",
      iconUpdatedAt: 12,
      createdAt: 7
    }
  ]);
  assert.deepEqual(settings.serviceOrder, ["custom:docs", "chatgpt", "claude", ...BUILT_IN_ORDER.filter((id) => !["chatgpt", "claude"].includes(id))]);
  assert.deepEqual(settings.hiddenServiceIds, ["gemini", ...DEFAULT_HIDDEN]);
  assert.equal(settings.quickAccessConfigured, true);
  assert.deepEqual(settings.sidePanelChrome, {
    headerCollapsed: false,
    footerCollapsed: false
  });
  assert.equal(settings.language, "auto");
  assert.equal(settings.lastUrlByPreset.chatgpt, "https://chatgpt.com/");
  assert.equal(settings.lastUrlByPreset.keep, undefined);
  assert.equal(settings.lastUrlByPreset.custom, "");
  assert.equal(settings.lastUrlByPreset["custom:docs"], "https://docs.example.com/chat");
  assert.equal(settings.enableFrameHeaderRelaxation, false);
  assert.equal(settings.frameHeaderRelaxationAcknowledged, false);
  assert.deepEqual(Object.keys(settings.diagnostics), ["valid"]);
});

test("normalizeSettings migrates removed Keep selections and invalid icon URLs", () => {
  const settings = normalizeSettings({
    defaultPresetId: "keep",
    activePresetId: "keep",
    customUrls: [
      {
        id: "bad-icon",
        label: "Bad Icon",
        url: "https://bad.example.com/",
        iconUrl: "javascript:alert(1)",
        iconUpdatedAt: 1,
        createdAt: 2
      }
    ],
    serviceOrder: ["keep"],
    hiddenServiceIds: ["keep"]
  });

  assert.equal(settings.defaultPresetId, "chatgpt");
  assert.equal(settings.activePresetId, "chatgpt");
  assert.equal(settings.customUrls[0].iconUrl, undefined);
  assert.deepEqual(settings.serviceOrder, [...BUILT_IN_ORDER, "custom:bad-icon"]);
  assert.deepEqual(settings.hiddenServiceIds, DEFAULT_HIDDEN);
  assert.equal(settings.quickAccessConfigured, true);
});

test("normalizeSettings keeps valid side panel chrome settings and drops invalid values", () => {
  assert.deepEqual(normalizeSettings({}).sidePanelChrome, {
    headerCollapsed: false,
    footerCollapsed: false
  });

  assert.deepEqual(
    normalizeSettings({
      sidePanelChrome: {
        headerCollapsed: true,
        footerCollapsed: "yes"
      }
    }).sidePanelChrome,
    {
      headerCollapsed: true,
      footerCollapsed: false
    }
  );
});

test("frame header relaxation is off by default and old implicit true settings must opt in again", () => {
  const defaults = defaultSettings();
  assert.equal(defaults.language, "auto");
  assert.equal(defaults.enableFrameHeaderRelaxation, false);
  assert.equal(defaults.frameHeaderRelaxationAcknowledged, false);
  assert.deepEqual(defaults.serviceOrder, BUILT_IN_ORDER);
  assert.deepEqual(defaults.hiddenServiceIds, DEFAULT_HIDDEN);
  assert.equal(defaults.quickAccessConfigured, true);
  assert.deepEqual(defaults.sidePanelChrome, {
    headerCollapsed: false,
    footerCollapsed: false
  });

  const legacyImplicit = normalizeSettings({
    enableFrameHeaderRelaxation: true
  });
  assert.equal(legacyImplicit.enableFrameHeaderRelaxation, false);
  assert.equal(legacyImplicit.frameHeaderRelaxationAcknowledged, false);

  const optedIn = normalizeSettings({
    enableFrameHeaderRelaxation: true,
    frameHeaderRelaxationAcknowledged: true,
    frameHeaderRelaxationChangeId: "diagnostic-change"
  });
  assert.equal(optedIn.enableFrameHeaderRelaxation, true);
  assert.equal(optedIn.frameHeaderRelaxationAcknowledged, true);
  assert.equal(optedIn.frameHeaderRelaxationChangeId, "diagnostic-change");

  assert.equal(normalizeSettings({ language: "ja" }).language, "ja");
  assert.equal(normalizeSettings({ language: "en" }).language, "en");
  assert.equal(normalizeSettings({ language: "fr" }).language, "auto");
});

test("getSettings migrates legacy settings into the current storage key", async () => {
  const storage = createLocalStorage({
    [LEGACY_SETTINGS_KEY]: {
      defaultPresetId: "claude",
      activePresetId: "custom:docs",
      customUrls: [
        {
          id: "docs",
          label: "Docs",
          url: "docs.example.com",
          createdAt: 11
        }
      ],
      lastUrlByPreset: {
        "custom:docs": "docs.example.com/thread"
      }
    }
  });

  globalThis.chrome = {
    storage: {
      local: storage.api
    }
  };

  const settings = await getSettings();

  assert.equal(settings.defaultPresetId, "claude");
  assert.equal(settings.language, "auto");
  assert.equal(settings.activePresetId, "custom:docs");
  assert.equal(settings.customUrls[0].url, "https://docs.example.com/");
  assert.equal(settings.lastUrlByPreset["custom:docs"], "https://docs.example.com/thread");
  assert.deepEqual(storage.calls.get, [[SETTINGS_KEY, LEGACY_SETTINGS_KEY]]);
  assert.deepEqual(storage.calls.remove, [LEGACY_SETTINGS_KEY]);
  assert.deepEqual(storage.data[SETTINGS_KEY], settings);
  assert.equal(storage.data[LEGACY_SETTINGS_KEY], undefined);
});

function createLocalStorage(initialData) {
  const data = { ...initialData };
  const calls = {
    get: [],
    remove: [],
    set: []
  };

  return {
    calls,
    data,
    api: {
      async get(keys) {
        calls.get.push(keys);
        const keyList = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(keyList.map((key) => [key, data[key]]));
      },
      async remove(keys) {
        calls.remove.push(keys);
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const key of keyList) {
          delete data[key];
        }
      },
      async set(values) {
        calls.set.push(values);
        Object.assign(data, values);
      }
    }
  };
}
