import { Messages } from "../shared/messages.js";
import { detectAIService } from "../features/composer/lib/aiService.js";
import { FRAME_COMPATIBILITY_DOMAINS, isBuiltInPresetId } from "../shared/presets.js";
import { createActiveTabPrompt, createSelectionPrompt } from "../shared/prompt.js";
import { FALLBACK_WINDOW_KEY, getSettings, SETTINGS_KEY } from "../shared/storage.js";
import { resolveLanguage, t, type ResolvedLanguage } from "../shared/i18n.js";
import type { AIInputInsertReason, AIService, InsertResult, PageContext } from "../features/composer/types.js";
import type { FallbackWindowState, PresetId, RuntimeMessage, RuntimeResponse, Settings } from "../shared/types.js";

const DNR_RULESET_ID = "allow_framing_ai_sites";
const DNR_SESSION_RULE_ID = 1001;
const OFFSCREEN_DOCUMENT_PATH = "src/offscreen/clipboard.html";
const MENU_SELECTION_ID = "ask-anyside-selection";
const MENU_OPEN_ID = "open-anyside";
const LEGACY_FALLBACK_WINDOW_KEY = "aiSidecar.fallbackWindow";
const AI_INPUT_AGENT_PORT = "ai-input-agent";
const INSERT_TIMEOUT_MS = 3000;
const FRAME_COMPATIBILITY_SESSION_TTL_MS = 30000;

type AiAgentRecord = {
  port: chrome.runtime.Port;
  service: AIService;
  url: string;
  senderUrl: string;
  tabId?: number;
  windowId?: number;
  frameId?: number;
  documentId?: string;
  connectedAt: number;
};

type AiAgentReadyMessage = {
  type: "AI_AGENT_READY";
  service: AIService;
  url: string;
};

type AiInsertResultMessage = {
  type: "INSERT_TEXT_RESULT";
  requestId?: string;
  success: boolean;
  reason?: AIInputInsertReason;
  service: AIService;
  message?: string;
};

type AiAgentTarget = {
  service: AIService;
  url: string;
  senderUrl?: string;
  tabId?: number;
  fallbackTabId?: number;
  fallbackUrl?: string;
  frameId?: number;
  documentId?: string;
};

type AiAgentSelection =
  | { status: "matched"; agent: AiAgentRecord }
  | { status: "ambiguous" }
  | { status: "unavailable" };

const aiInputAgents = new Set<AiAgentRecord>();

let initializationPromise: Promise<void> | undefined;
let offscreenDocumentPromise: Promise<void> | undefined;
let dnrMutationPromise: Promise<void> = Promise.resolve();

type FrameCompatibilitySession = {
  id: string;
  ruleActive: boolean;
  timer: ReturnType<typeof setTimeout>;
};

const frameCompatibilitySessions = new Map<string, FrameCompatibilitySession>();

function ensureInitialized(options: { resetMenus: boolean } = { resetMenus: false }): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = initializeExtension(options).catch((error) => {
      initializationPromise = undefined;
      throw error;
    });
  }
  return initializationPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  initializationPromise = initializeExtension({ resetMenus: true }).catch((error) => {
    initializationPromise = undefined;
    throw error;
  });
});

chrome.runtime.onStartup.addListener(() => {
  initializationPromise = initializeExtension({ resetMenus: false }).catch((error) => {
    initializationPromise = undefined;
    throw error;
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_SELECTION_ID && info.selectionText) {
    void handleSelectionContextMenu(info.selectionText, tab);
    return;
  }

  if (info.menuItemId === MENU_OPEN_ID) {
    void openSidePanel(tab?.windowId);
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message?.type === Messages.OFFSCREEN_COPY_TEXT && message.target === "offscreen") {
    return false;
  }

  handleRuntimeMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== AI_INPUT_AGENT_PORT) {
    return;
  }

  let record: AiAgentRecord | undefined;

  port.onMessage.addListener((message: AiAgentReadyMessage) => {
    if (message?.type !== "AI_AGENT_READY") {
      return;
    }

    if (record) {
      aiInputAgents.delete(record);
    }

    const senderUrl = port.sender?.url || "";
    if (!senderUrl) {
      try { port.disconnect(); } catch {}
      return;
    }
    const service = detectAIService(senderUrl);
    if (service === "unknown") {
      try { port.disconnect(); } catch {}
      return;
    }

    record = {
      port,
      service,
      url: senderUrl,
      senderUrl,
      tabId: port.sender?.tab?.id,
      windowId: port.sender?.tab?.windowId,
      frameId: port.sender?.frameId,
      documentId: getSenderDocumentId(port.sender),
      connectedAt: Date.now()
    };
    aiInputAgents.add(record);
  });

  port.onDisconnect.addListener(() => {
    if (record) {
      aiInputAgents.delete(record);
    }
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  void clearFallbackWindowIfNeeded(windowId);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SETTINGS_KEY]) {
    return;
  }
  const oldLanguage = languageFromSettings(changes[SETTINGS_KEY].oldValue as Partial<Settings> | undefined);
  const newLanguage = languageFromSettings(changes[SETTINGS_KEY].newValue as Partial<Settings> | undefined);
  if (oldLanguage !== newLanguage) {
    void createContextMenus();
  }
});

void ensureInitialized();

async function initializeExtension(options: { resetMenus: boolean }): Promise<void> {
  await getSettings();
  await configureSidePanel();
  await recoverFrameCompatibilityRules();
  if (options.resetMenus) {
    await createContextMenus();
  }
}

async function configureSidePanel(): Promise<void> {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }

  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

async function createContextMenus(): Promise<void> {
  const language = await getResolvedLanguage();
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_SELECTION_ID,
    title: t(language, "background.menuSelection"),
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: MENU_OPEN_ID,
    title: t(language, "background.menuOpen"),
    contexts: ["all"]
  });
}

async function handleRuntimeMessage(message: RuntimeMessage, sender: chrome.runtime.MessageSender): Promise<RuntimeResponse> {
  if (!isFromExtensionPage(sender)) {
    return { ok: false, error: "Forbidden." };
  }

  await ensureInitialized();

  switch (message?.type) {
    case Messages.START_FRAME_COMPATIBILITY_SESSION: {
      const sessionId = await startFrameCompatibilitySession(message.presetId, message.url, message.enabled);
      return { ok: true, frameCompatibilitySessionId: sessionId };
    }

    case Messages.END_FRAME_COMPATIBILITY_SESSION: {
      await endFrameCompatibilitySession(message.sessionId);
      return { ok: true, settings: await getSettings() };
    }

    case Messages.COPY_ACTIVE_TAB_PROMPT: {
      const tab = await getActiveTab();
      const language = await getResolvedLanguage();
      const text = createActiveTabPrompt(tab?.title, tab?.url, language);
      await copyText(text);
      await flashBadge(t(language, "common.copied"));
      return { ok: true, text };
    }

    case Messages.COPY_TEXT: {
      await copyText(message.text);
      await flashBadge(t(await getResolvedLanguage(), "common.copied"));
      return { ok: true, text: message.text };
    }

    case Messages.GET_PAGE_CONTEXT: {
      const pageContext = await getPageContextFromActiveTab();
      return { ok: true, pageContext };
    }

    case Messages.INSERT_TEXT_TO_AI: {
      const insertResult = await insertTextIntoAI(message.text, message.service, message.url, sender);
      return { ok: true, insertResult, text: message.text };
    }

    case Messages.OPEN_FALLBACK_WINDOW: {
      if (!isAllowedFallbackUrl(message.url)) {
        return { ok: false, error: "Invalid URL." };
      }
      const windowId = await openFallbackWindow(message.url, sender.tab?.windowId);
      return { ok: true, windowId };
    }

    case Messages.OPEN_SIDE_PANEL: {
      await openSidePanel(sender.tab?.windowId);
      return { ok: true };
    }

    default:
      return { ok: false, error: "Unsupported message." };
  }
}

function isFromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  if (sender.tab) return false;
  const url = sender.url || "";
  return url.startsWith(chrome.runtime.getURL(""));
}

function isAllowedFallbackUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function getPageContextFromActiveTab(): Promise<PageContext> {
  const tab = await getActiveTab();
  const fallback = createPageContext(tab?.title, tab?.url, "");
  if (tab?.id === undefined || !canInjectIntoTab(tab)) {
    return fallback;
  }

  try {
    const [result] = await chrome.scripting.executeScript<PageContext>({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title || "",
        url: location.href || "",
        selection: window.getSelection()?.toString() || "",
        timestamp: Date.now()
      })
    });

    return normalizePageContext(result?.result, fallback);
  } catch {
    return fallback;
  }
}

function createPageContext(title: string | undefined, url: string | undefined, selection: string): PageContext {
  return {
    title: title || "",
    url: url || "",
    selection,
    timestamp: Date.now()
  };
}

function normalizePageContext(value: PageContext | undefined, fallback: PageContext): PageContext {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  return {
    title: typeof value.title === "string" ? value.title : fallback.title,
    url: typeof value.url === "string" ? value.url : fallback.url,
    selection: typeof value.selection === "string" ? value.selection : "",
    timestamp: typeof value.timestamp === "number" ? value.timestamp : Date.now()
  };
}

async function insertTextIntoAI(
  text: string,
  service: AIService,
  url: string,
  sender?: chrome.runtime.MessageSender
): Promise<InsertResult> {
  const language = await getResolvedLanguage();
  const selection = await findAiInputAgent({
    service,
    url,
    senderUrl: sender?.url,
    tabId: sender?.tab?.id,
    frameId: sender?.frameId,
    documentId: getSenderDocumentId(sender)
  });
  if (selection.status === "matched") {
    const result = await requestAgentInsert(selection.agent.port, text);
    if (result.success) {
      return {
        success: true,
        method: "direct",
        service: selection.agent.service,
        reason: "inserted",
        message: t(language, "background.inserted")
      };
    }

    await copyText(text);
    await flashBadge(t(language, "common.copied"));
    return {
      success: true,
      method: "clipboard",
      service,
      reason: result.reason,
      message: result.reason === "no-input"
        ? t(language, "side.noInputCopied")
        : t(language, "side.insertFailedCopied")
    };
  }

  await copyText(text);
  await flashBadge(t(language, "common.copied"));
  return {
    success: true,
    method: "clipboard",
    service,
    reason: "agent-unavailable",
    message: selection.status === "ambiguous"
      ? t(language, "side.ambiguousCopied")
      : t(language, "side.aiDisconnected")
  };
}

async function findAiInputAgent(target: AiAgentTarget): Promise<AiAgentSelection> {
  const fallbackWindow = await getFallbackWindowState().catch((): FallbackWindowState => ({}));
  return selectAiInputAgent([...aiInputAgents], {
    ...target,
    fallbackTabId: fallbackWindow.tabId,
    fallbackUrl: fallbackWindow.url
  });
}

function selectAiInputAgent(agents: AiAgentRecord[], target: AiAgentTarget): AiAgentSelection {
  if (target.service === "unknown" || !isValidUrl(target.url)) {
    return { status: "unavailable" };
  }

  const matchingAgents = agents.filter((agent) => {
    return agent.service === target.service && matchesOrigin(agent, target.url);
  });

  if (matchingAgents.length === 0) {
    return { status: "unavailable" };
  }

  const byDocument = target.documentId
    ? uniqueAgent(matchingAgents.filter((agent) => agent.documentId === target.documentId))
    : undefined;
  if (byDocument && byDocument.status !== "unavailable") {
    return byDocument;
  }

  const byFrame = target.tabId !== undefined && target.frameId !== undefined
    ? uniqueAgent(matchingAgents.filter((agent) => agent.tabId === target.tabId && agent.frameId === target.frameId))
    : undefined;
  if (byFrame && byFrame.status !== "unavailable") {
    return byFrame;
  }

  const sidePanelCandidates = matchingAgents.filter((agent) => agent.tabId === undefined);
  const exactSidePanelAgent = uniqueAgent(sidePanelCandidates.filter((agent) => matchesExactUrl(agent, target.url)));
  if (exactSidePanelAgent.status !== "unavailable") {
    return exactSidePanelAgent;
  }

  const sidePanelAgent = uniqueAgent(sidePanelCandidates);
  if (sidePanelAgent.status !== "unavailable") {
    return sidePanelAgent;
  }

  if (target.fallbackTabId !== undefined && (!target.fallbackUrl || sameUrl(target.fallbackUrl, target.url))) {
    const fallbackAgent = uniqueAgent(
      matchingAgents.filter((agent) => agent.tabId === target.fallbackTabId && matchesExactUrl(agent, target.url))
    );
    if (fallbackAgent.status !== "unavailable") {
      return fallbackAgent;
    }
  }

  return { status: "ambiguous" };
}

function uniqueAgent(agents: AiAgentRecord[]): AiAgentSelection {
  if (agents.length === 0) {
    return { status: "unavailable" };
  }
  if (agents.length === 1) {
    return { status: "matched", agent: agents[0] };
  }
  return { status: "ambiguous" };
}

async function requestAgentInsert(port: chrome.runtime.Port, text: string): Promise<{ success: boolean; reason: AIInputInsertReason }> {
  const requestId = crypto.randomUUID();

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish(false, "insert-failed"), INSERT_TIMEOUT_MS);
    const listener = (message: AiInsertResultMessage) => {
      if (message?.type !== "INSERT_TEXT_RESULT") {
        return;
      }
      if (!message.requestId || message.requestId !== requestId) {
        return;
      }
      finish(message.success === true, message.reason || (message.success ? "inserted" : "insert-failed"));
    };
    const disconnectListener = () => {
      finish(false, "insert-failed");
    };
    const finish = (success: boolean, reason: AIInputInsertReason) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        port.onMessage.removeListener(listener);
        port.onDisconnect.removeListener(disconnectListener);
      } catch {
        // Listeners may already be detached after disconnect; ignore.
      }
      resolve({ success, reason });
    };

    port.onMessage.addListener(listener);
    port.onDisconnect.addListener(disconnectListener);
    try {
      port.postMessage({ type: "INSERT_TEXT", requestId, text });
    } catch {
      finish(false, "insert-failed");
    }
  });
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function matchesOrigin(agent: AiAgentRecord, url: string): boolean {
  return sameOrigin(agent.url, url) || sameOrigin(agent.senderUrl, url);
}

function matchesExactUrl(agent: AiAgentRecord, url: string): boolean {
  return sameUrl(agent.url, url) || sameUrl(agent.senderUrl, url);
}

function sameUrl(left: string, right: string): boolean {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return false;
  }
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function getSenderDocumentId(sender: chrome.runtime.MessageSender | undefined): string | undefined {
  return (sender as (chrome.runtime.MessageSender & { documentId?: string }) | undefined)?.documentId;
}

async function startFrameCompatibilitySession(presetId: PresetId, url: string, enabled: boolean): Promise<string> {
  return withDnrMutation(async () => {
    const id = crypto.randomUUID();
    const ruleActive = enabled && isFrameCompatibilityTarget(presetId, url);
    const timer = setTimeout(() => {
      void endFrameCompatibilitySession(id);
    }, FRAME_COMPATIBILITY_SESSION_TTL_MS);
    (timer as { unref?: () => void }).unref?.();
    const session: FrameCompatibilitySession = {
      id,
      ruleActive,
      timer
    };
    frameCompatibilitySessions.set(id, session);

    if (!ruleActive) {
      return id;
    }

    try {
      await syncFrameCompatibilitySessionRules();
      return id;
    } catch (error) {
      clearTimeout(timer);
      frameCompatibilitySessions.delete(id);
      await syncFrameCompatibilitySessionRules().catch(() => undefined);
      throw error;
    }
  });
}

async function endFrameCompatibilitySession(sessionId: string): Promise<void> {
  await withDnrMutation(async () => {
    const session = frameCompatibilitySessions.get(sessionId);
    if (!session) {
      return;
    }

    frameCompatibilitySessions.delete(sessionId);
    clearTimeout(session.timer);
    if (session.ruleActive) {
      await syncFrameCompatibilitySessionRules();
    }
  });
}

async function withDnrMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = dnrMutationPromise.then(operation, operation);
  dnrMutationPromise = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function recoverFrameCompatibilityRules(): Promise<void> {
  await withDnrMutation(async () => {
    for (const session of frameCompatibilitySessions.values()) {
      clearTimeout(session.timer);
    }
    frameCompatibilitySessions.clear();
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [],
      disableRulesetIds: [DNR_RULESET_ID]
    });
    await syncFrameCompatibilitySessionRules();
  });
}

async function syncFrameCompatibilitySessionRules(): Promise<void> {
  const hasActiveSession = [...frameCompatibilitySessions.values()].some((session) => session.ruleActive);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [DNR_SESSION_RULE_ID],
    addRules: hasActiveSession ? [createFrameCompatibilitySessionRule()] : []
  });
}

function createFrameCompatibilitySessionRule(): chrome.declarativeNetRequest.Rule {
  return {
    id: DNR_SESSION_RULE_ID,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "x-frame-options", operation: "remove" },
        { header: "content-security-policy", operation: "remove" }
      ]
    },
    condition: {
      requestDomains: [...FRAME_COMPATIBILITY_DOMAINS],
      resourceTypes: ["sub_frame"],
      tabIds: [chrome.tabs.TAB_ID_NONE],
      initiatorDomains: [chrome.runtime.id]
    }
  };
}

function isFrameCompatibilityTarget(presetId: PresetId, url: string): boolean {
  if (!isBuiltInPresetId(presetId)) {
    return false;
  }

  try {
    return FRAME_COMPATIBILITY_DOMAINS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function openSidePanel(windowId?: number): Promise<void> {
  if (!chrome.sidePanel?.open) {
    return;
  }

  const resolvedWindowId = windowId ?? (await getActiveTab())?.windowId;
  if (resolvedWindowId !== undefined) {
    await chrome.sidePanel.open({ windowId: resolvedWindowId });
  }
}

async function handleSelectionContextMenu(selectionText: string, tab?: chrome.tabs.Tab): Promise<void> {
  const panelPromise = tab?.windowId !== undefined
    ? openSidePanel(tab.windowId).catch(() => undefined)
    : Promise.resolve();
  const language = await getResolvedLanguage();
  const text = createSelectionPrompt(selectionText, language);
  try {
    await copyText(text, tab);
    await flashBadge(t(language, "common.copied")).catch(() => undefined);
  } catch (error) {
    console.warn("Failed to copy context menu prompt.", error);
    await flashBadge(t(language, "common.error")).catch(() => undefined);
  } finally {
    await panelPromise;
  }
}

async function getResolvedLanguage(): Promise<ResolvedLanguage> {
  const settings = await getSettings();
  return languageFromSettings(settings);
}

function languageFromSettings(settings: Partial<Settings> | undefined): ResolvedLanguage {
  return resolveLanguage(settings?.language, chrome.i18n?.getUILanguage?.() || "");
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const currentWindowTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (currentWindowTabs[0]) {
    return currentWindowTabs[0];
  }

  const focusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return focusedTabs[0];
}

async function ensureOffscreenDocument(): Promise<void> {
  if (!offscreenDocumentPromise) {
    offscreenDocumentPromise = createOffscreenDocumentIfNeeded().finally(() => {
      offscreenDocumentPromise = undefined;
    });
  }

  await offscreenDocumentPromise;
}

async function createOffscreenDocumentIfNeeded(): Promise<void> {
  const documentUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [documentUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["CLIPBOARD"],
    justification: "Copy anyside prompts from context menus and extension UI."
  });
}

export const __testing = {
  ensureOffscreenDocument,
  selectAiInputAgent,
  startFrameCompatibilitySession,
  endFrameCompatibilitySession,
  recoverFrameCompatibilityRules,
  createFrameCompatibilitySessionRule,
  isFromExtensionPage,
  isAllowedFallbackUrl,
  handleRuntimeMessage,
  getRegisteredAgents(): AiAgentRecord[] {
    return [...aiInputAgents];
  }
};

async function copyText(text: string, tab?: chrome.tabs.Tab): Promise<void> {
  if (tab?.id !== undefined && canInjectIntoTab(tab)) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (value: string) => {
          await navigator.clipboard.writeText(value);
        },
        args: [text]
      });
      return;
    } catch {
      // Fall back to the offscreen helper for extension pages and restricted tabs.
    }
  }

  await ensureOffscreenDocument();
  const response = await sendOffscreenCopy(text);

  if (!response?.ok) {
    throw new Error(response?.error || "Clipboard copy failed.");
  }
}

const OFFSCREEN_COPY_MAX_ATTEMPTS = 5;
const OFFSCREEN_COPY_RETRY_DELAY_MS = 50;

async function sendOffscreenCopy(text: string): Promise<{ ok: boolean; error?: string } | undefined> {
  let lastResponse: { ok: boolean; error?: string } | undefined;
  for (let attempt = 0; attempt < OFFSCREEN_COPY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: Messages.OFFSCREEN_COPY_TEXT,
        target: "offscreen",
        text
      });
      if (response && typeof response === "object") {
        return response as { ok: boolean; error?: string };
      }
      lastResponse = response as undefined;
    } catch (error) {
      lastResponse = { ok: false, error: errorMessage(error) };
    }
    await new Promise((resolve) => setTimeout(resolve, OFFSCREEN_COPY_RETRY_DELAY_MS));
  }
  return lastResponse ?? { ok: false, error: "Offscreen document did not respond." };
}

function canInjectIntoTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url || "";
  return /^(https?:|file:)/.test(url);
}

async function flashBadge(text: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: "#126b46" });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: "" });
  }, 1400);
}

async function openFallbackWindow(url: string, senderWindowId?: number): Promise<number | undefined> {
  const state = await getFallbackWindowState();
  const reused = await tryReuseFallbackWindow(state, url);
  if (reused !== undefined) {
    return reused;
  }

  const mainWindow = senderWindowId !== undefined
    ? await chrome.windows.get(senderWindowId).catch(() => undefined)
    : await chrome.windows.getLastFocused().catch(() => undefined);

  const layout = calculateFallbackLayout(mainWindow);
  if (mainWindow?.id !== undefined && layout.main) {
    await chrome.windows.update(mainWindow.id, layout.main).catch(() => undefined);
  }

  const created = await chrome.windows.create({
    url,
    type: "normal",
    focused: true,
    ...layout.fallback
  });

  await saveFallbackWindowState({
    windowId: created.id,
    tabId: created.tabs?.[0]?.id,
    url,
    updatedAt: Date.now()
  });

  return created.id;
}

async function tryReuseFallbackWindow(state: FallbackWindowState, url: string): Promise<number | undefined> {
  if (state.windowId === undefined) {
    return undefined;
  }

  try {
    const existing = await chrome.windows.get(state.windowId, { populate: true });
    let tabId = state.tabId ?? existing.tabs?.[0]?.id;
    if (tabId !== undefined) {
      await chrome.tabs.update(tabId, { url, active: true });
    } else {
      const created = await chrome.tabs.create({ windowId: existing.id, url, active: true });
      tabId = created.id;
    }
    await chrome.windows.update(existing.id as number, { focused: true });
    await saveFallbackWindowState({ ...state, tabId, url, updatedAt: Date.now() });
    return existing.id;
  } catch {
    await saveFallbackWindowState({});
    return undefined;
  }
}

function calculateFallbackLayout(window: chrome.windows.Window | undefined): {
  main?: chrome.windows.UpdateInfo;
  fallback: chrome.windows.CreateData;
} {
  const left = window?.left ?? 80;
  const top = window?.top ?? 80;
  const width = Math.max(window?.width ?? 1280, 900);
  const height = Math.max(window?.height ?? 820, 600);
  const fallbackWidth = Math.min(560, Math.max(420, Math.round(width * 0.34)));
  const mainWidth = Math.max(640, width - fallbackWidth);

  return {
    main: window?.id !== undefined
      ? { left, top, width: mainWidth, height, focused: false }
      : undefined,
    fallback: {
      left: left + mainWidth,
      top,
      width: fallbackWidth,
      height
    }
  };
}

async function getFallbackWindowState(): Promise<FallbackWindowState> {
  const stored = await chrome.storage.local.get([FALLBACK_WINDOW_KEY, LEGACY_FALLBACK_WINDOW_KEY]);
  if (!stored[FALLBACK_WINDOW_KEY] && stored[LEGACY_FALLBACK_WINDOW_KEY]) {
    await chrome.storage.local.set({ [FALLBACK_WINDOW_KEY]: stored[LEGACY_FALLBACK_WINDOW_KEY] });
    await chrome.storage.local.remove(LEGACY_FALLBACK_WINDOW_KEY);
  }

  const state = stored[FALLBACK_WINDOW_KEY] || stored[LEGACY_FALLBACK_WINDOW_KEY];
  return state && typeof state === "object" ? state as FallbackWindowState : {};
}

async function saveFallbackWindowState(state: FallbackWindowState): Promise<void> {
  await chrome.storage.local.set({ [FALLBACK_WINDOW_KEY]: state });
}

async function clearFallbackWindowIfNeeded(windowId: number): Promise<void> {
  const state = await getFallbackWindowState();
  if (state.windowId === windowId) {
    await saveFallbackWindowState({});
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
