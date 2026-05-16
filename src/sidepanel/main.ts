import { Messages } from "../shared/messages.js";
import { CONTEXT_ACTIONS, PROMPT_TEMPLATES, detectAIService, renderContextTemplate, renderPromptTemplate } from "../features/composer/index.js";
import { BUILT_IN_PRESETS, FRAME_COMPATIBILITY_DOMAINS, diagnosticKey, isBuiltInPresetId, makeCustomPresetId, resolveTarget } from "../shared/presets.js";
import { getSettings, normalizeSettings, saveSettings, SETTINGS_KEY } from "../shared/storage.js";
import { CUSTOM_PROMPT_TEMPLATES_KEY, getCustomPromptTemplates } from "../storage/promptTemplateStorage.js";
import type { AIService, ContextMode, PageContext, PromptTemplate } from "../features/composer/types.js";
import type { ActivePresetId, DiagnosticEntry, DiagnosticStatus, PresetId, RuntimeMessage, RuntimeResponse, Settings } from "../shared/types.js";

const LOAD_NOTICE_MS = 4500;
const LOAD_TIMEOUT_MS = 8000;
const TOAST_MS = 2200;
const RECENT_PROMPTS_KEY = "composer.recentPromptTemplateIds";
const SERVICE_ICON_SRC: Partial<Record<PresetId, string>> = {
  chatgpt: "../../assets/service-icons/chatgpt.svg",
  claude: "../../assets/service-icons/claude.png",
  gemini: "../../assets/service-icons/gemini.png",
  perplexity: "../../assets/service-icons/perplexity.svg",
  notebooklm: "../../assets/service-icons/notebooklm.svg"
};

const app = element<HTMLElement>("app");
const statusLive = element<HTMLElement>("statusLive");
const statusBanner = element<HTMLElement>("statusBanner");
const statusBannerText = element<HTMLElement>("statusBannerText");
const moreActionsButton = element<HTMLButtonElement>("moreActionsButton");
const headerReloadButton = element<HTMLButtonElement>("headerReloadButton");
const headerChromeToggleButton = element<HTMLButtonElement>("headerChromeToggleButton");
const footerChromeToggleButton = element<HTMLButtonElement>("footerChromeToggleButton");
const statusText = element<HTMLElement>("statusText");
const loadingSpinner = element<HTMLElement>("loadingSpinner");
const elapsedText = element<HTMLElement>("elapsedText");
const serviceSwitcher = element<HTMLElement>("serviceSwitcher");
const serviceMenu = element<HTMLElement>("serviceMenu");
const hideServiceButton = element<HTMLButtonElement>("hideServiceButton");
let aiFrame = element<HTMLIFrameElement>("aiFrame");
const dismissLayer = element<HTMLButtonElement>("dismissLayer");
const fallbackPanel = element<HTMLElement>("fallbackPanel");
const fallbackServiceName = element<HTMLElement>("fallbackServiceName");
const fallbackReason = element<HTMLElement>("fallbackReason");
const fallbackOpenTabButton = element<HTMLButtonElement>("fallbackOpenTabButton");
const fallbackOpenWindowButton = element<HTMLButtonElement>("fallbackOpenWindowButton");
const fallbackReloadButton = element<HTMLButtonElement>("fallbackReloadButton");
const setupPanel = element<HTMLElement>("setupPanel");
const setupOptionsButton = element<HTMLButtonElement>("setupOptionsButton");
const composerToast = element<HTMLElement>("composerToast");
const composerToolbar = element<HTMLElement>("composerToolbar");
const composerLauncherButton = element<HTMLButtonElement>("composerLauncherButton");
const composerActions = element<HTMLElement>("composerActions");
const contextButton = element<HTMLButtonElement>("contextButton");
const promptButton = element<HTMLButtonElement>("promptButton");
const contextPopover = element<HTMLElement>("contextPopover");
const contextSummary = element<HTMLElement>("contextSummary");
const contextActions = element<HTMLElement>("contextActions");
const promptPalette = element<HTMLElement>("promptPalette");
const promptSearchInput = element<HTMLInputElement>("promptSearchInput");
const promptList = element<HTMLElement>("promptList");
const diagnosticsDetails = element<HTMLDetailsElement>("diagnosticsDetails");
const diagnosticsTable = element<HTMLTableSectionElement>("diagnosticsTable");
const diagnosticsEnabled = isDebugMode();

type StatusTone = "idle" | "loading" | "success" | "warning" | "error" | "diagnostic";
type DisplayTarget = { id: ActivePresetId; label: string; url: string };
type ServiceOption = DisplayTarget & { iconSrc?: string; isCustom: boolean };
type LoadOptions = { activePresetId: ActivePresetId; diagnostic?: { dnrEnabled: boolean; presetId: PresetId } };
type ActiveDiagnostic = {
  key: string;
  token: number;
  sessionId: number;
  frameCompatibilitySessionId?: string;
  returnTarget?: DisplayTarget;
};

let settings: Settings;
let currentUrl = "";
let currentLabel = "";
let loadToken = 0;
let completedLoadToken: number | undefined;
let timedOutLoadToken: number | undefined;
let loadNoticeTimer: number | undefined;
let loadTimeoutTimer: number | undefined;
let elapsedTimer: number | undefined;
let loadStartedAt = 0;
let activeDiagnostic: ActiveDiagnostic | null = null;
let diagnosticSessionId = 0;
let pendingDiagnosticSession: number | null = null;
let finalizingDiagnosticSession: number | null = null;
let activeFrameCompatibilitySessionId: string | undefined;
let lastContext: PageContext | null = null;
let promptQuery = "";
let activePromptIndex = 0;
let toastTimer: number | undefined;
let composerCollapsed = true;
let promptTemplates: PromptTemplate[] = [...PROMPT_TEMPLATES];
let draggedServiceId: ActivePresetId | null = null;
let menuServiceId: ActivePresetId | null = null;

void init();

async function init(): Promise<void> {
  diagnosticsDetails.hidden = !diagnosticsEnabled;
  settings = await getSettings();
  await loadPromptTemplates();
  syncSettingsUi();
  bindEvents();

  await loadConfiguredTarget();
}

function bindEvents(): void {
  serviceSwitcher.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-preset-id]") : null;
    if (!target) {
      return;
    }
    closeServiceMenu();
    void selectService(target.dataset.presetId || "");
  });
  serviceSwitcher.addEventListener("contextmenu", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-preset-id]") : null;
    if (!target) {
      return;
    }
    event.preventDefault();
    openServiceMenu(target.dataset.presetId || "");
  });
  serviceSwitcher.addEventListener("dragstart", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-preset-id]") : null;
    if (!target) {
      return;
    }
    draggedServiceId = target.dataset.presetId as ActivePresetId;
    target.dataset.dragging = "true";
    event.dataTransfer?.setData("text/plain", draggedServiceId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  });
  serviceSwitcher.addEventListener("dragend", () => {
    draggedServiceId = null;
    for (const button of Array.from(serviceSwitcher.querySelectorAll<HTMLButtonElement>("[data-dragging]"))) {
      delete button.dataset.dragging;
    }
  });
  serviceSwitcher.addEventListener("dragover", (event) => {
    if (!draggedServiceId) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });
  serviceSwitcher.addEventListener("drop", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-preset-id]") : null;
    if (!target || !draggedServiceId) {
      return;
    }
    event.preventDefault();
    void moveService(draggedServiceId, target.dataset.presetId || "");
  });
  hideServiceButton.addEventListener("click", () => {
    if (!menuServiceId) {
      return;
    }
    void hideService(menuServiceId);
  });
  fallbackReloadButton.addEventListener("click", () => void reloadCurrentUrl());
  fallbackOpenTabButton.addEventListener("click", () => void openCurrentInTab());
  fallbackOpenWindowButton.addEventListener("click", () => void openCurrentInFallbackWindow());
  setupOptionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  moreActionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  headerReloadButton.addEventListener("click", () => void reloadCurrentUrl());
  headerChromeToggleButton.addEventListener("click", () => {
    void setSidePanelChromeCollapsed("header", !settings.sidePanelChrome.headerCollapsed);
  });
  footerChromeToggleButton.addEventListener("click", () => {
    void setSidePanelChromeCollapsed("footer", !settings.sidePanelChrome.footerCollapsed);
  });
  dismissLayer.addEventListener("click", () => closeComposerMenus());
  bindComposerEvents();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[CUSTOM_PROMPT_TEMPLATES_KEY]) {
      void loadPromptTemplates();
    }

    if (!changes[SETTINGS_KEY]?.newValue) {
      return;
    }

    const previousDefaultPresetId = settings.defaultPresetId;
    const previousConfiguredTarget = resolveTarget(settings, settings.defaultPresetId);
    settings = normalizeSettings(changes[SETTINGS_KEY].newValue);
    syncSettingsUi();

    if (isDiagnosticBusy()) {
      return;
    }

    const target = resolveTarget(settings, settings.defaultPresetId);
    if (previousDefaultPresetId !== settings.defaultPresetId || target.url !== previousConfiguredTarget.url) {
      void loadConfiguredTarget();
      return;
    }

    if (currentUrl === target.url && currentLabel !== target.label) {
      currentLabel = target.label;
      fallbackServiceName.textContent = target.label;
    }
  });

  if (diagnosticsEnabled) {
    diagnosticsTable.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const presetId = target.dataset.presetId as PresetId | undefined;
      if (!presetId) {
        return;
      }

      if (target.dataset.runDnr !== undefined) {
        void runDiagnostic(presetId, target.dataset.runDnr === "true");
        return;
      }

      if (target.dataset.markDnr !== undefined && target.dataset.markStatus) {
        void markDiagnostic(presetId, target.dataset.markDnr === "true", target.dataset.markStatus as DiagnosticStatus);
      }
    });
  }

  window.addEventListener("pagehide", () => {
    void endActiveFrameCompatibilitySession();
    void cancelActiveDiagnostic("Side panel closed before the diagnostic finished.");
  });
  window.addEventListener("beforeunload", () => {
    void endActiveFrameCompatibilitySession();
    void cancelActiveDiagnostic("Side panel unloaded before the diagnostic finished.");
  });
}

function bindComposerEvents(): void {
  composerLauncherButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setComposerExpanded(composerCollapsed);
  });
  contextButton.addEventListener("click", (event) => {
    event.stopPropagation();
    void toggleContextPopover();
  });
  contextActions.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-mode]") : null;
    if (!target || target.disabled) {
      return;
    }
    void handleContextAction(target.dataset.mode as ContextMode);
  });

  promptButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!promptPalette.hidden) {
      closeComposerMenus();
      return;
    }
    setComposerExpanded(true);
    openPromptPalette();
  });
  promptSearchInput.addEventListener("input", () => {
    promptQuery = promptSearchInput.value;
    activePromptIndex = 0;
    renderPromptList();
  });
  promptList.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-template-id]") : null;
    if (!target) {
      return;
    }
    void handlePromptSelection(target.dataset.templateId || "");
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!serviceMenu.contains(target)) {
      closeServiceMenu();
    }
    if (!contextPopover.contains(target) && !composerToolbar.contains(target)) {
      closeContextPopover();
    }
    if (!promptPalette.contains(target) && !composerToolbar.contains(target)) {
      closePromptPalette();
    }
    if (!contextPopover.contains(target) && !promptPalette.contains(target) && !composerToolbar.contains(target)) {
      closeComposerMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      void openPromptFromShortcut();
      return;
    }

    if (event.key === "Escape") {
      closeServiceMenu();
      closeComposerMenus();
      return;
    }

    if (!promptPalette.hidden) {
      handlePromptPaletteKeydown(event);
    }
  });
  setComposerExpanded(false);
}

function setComposerExpanded(expanded: boolean): void {
  const nextExpanded = expanded && !settings.sidePanelChrome.footerCollapsed;
  composerCollapsed = !nextExpanded;
  composerToolbar.dataset.expanded = nextExpanded ? "true" : "false";
  composerLauncherButton.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
  composerActions.setAttribute("aria-hidden", settings.sidePanelChrome.footerCollapsed ? "true" : "false");
}

async function openPromptFromShortcut(): Promise<void> {
  if (settings.sidePanelChrome.footerCollapsed) {
    await setSidePanelChromeCollapsed("footer", false);
  }
  setComposerExpanded(true);
  openPromptPalette();
}

async function toggleContextPopover(): Promise<void> {
  if (!contextPopover.hidden) {
    closeComposerMenus();
    return;
  }

  closePromptPalette();
  setComposerExpanded(true);
  contextButton.setAttribute("aria-expanded", "true");
  contextPopover.hidden = false;
  syncDismissLayer();
  lastContext = await collectPageContext();
  renderContextActions(lastContext);
}

function closeContextPopover(): void {
  contextPopover.hidden = true;
  contextButton.setAttribute("aria-expanded", "false");
  syncDismissLayer();
}

function closeComposerMenus(): void {
  contextPopover.hidden = true;
  contextButton.setAttribute("aria-expanded", "false");
  promptPalette.hidden = true;
  promptButton.setAttribute("aria-expanded", "false");
  setComposerExpanded(false);
  syncDismissLayer();
}

function syncDismissLayer(): void {
  dismissLayer.hidden = contextPopover.hidden && promptPalette.hidden;
}

function renderContextActions(context: PageContext): void {
  contextActions.textContent = "";
  const selectionLength = context.selection.trim().length;
  contextSummary.textContent = selectionLength > 0 ? `選択中: ${selectionLength}文字` : "選択テキストなし";

  for (const action of CONTEXT_ACTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.mode = action.mode;
    button.textContent = action.label;
    if (action.requiresSelection && selectionLength === 0) {
      button.title = "選択テキストがありません";
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    }
    contextActions.append(button);
  }
}

async function handleContextAction(mode: ContextMode): Promise<void> {
  const context = lastContext || await collectPageContext();
  if (mode === "selection" && !context.selection.trim()) {
    showToast("選択テキストがありません");
    return;
  }

  const text = renderContextTemplate(context, mode);
  if (!text) {
    showToast("このページではContextを取得できません");
    return;
  }

  closeContextPopover();
  const result = await insertIntoAI(text);
  showToast(contextToastMessage(mode, result));
  setComposerExpanded(false);
}

function openPromptPalette(): void {
  closeContextPopover();
  setComposerExpanded(true);
  promptButton.setAttribute("aria-expanded", "true");
  promptPalette.hidden = false;
  syncDismissLayer();
  promptQuery = promptSearchInput.value;
  activePromptIndex = 0;
  renderPromptList();
  void loadPromptTemplates();
  window.setTimeout(() => promptSearchInput.focus(), 0);
}

function closePromptPalette(): void {
  promptPalette.hidden = true;
  promptButton.setAttribute("aria-expanded", "false");
  syncDismissLayer();
}

function renderPromptList(): void {
  promptList.textContent = "";
  const templates = filteredPromptTemplates();
  if (templates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "composer-empty";
    empty.textContent = promptTemplates.length === 0 ? "OptionsでPromptを追加してください" : "一致するPromptがありません";
    promptList.append(empty);
    return;
  }

  activePromptIndex = Math.max(0, Math.min(activePromptIndex, templates.length - 1));
  const recentIds = readRecentPromptIds();
  templates.forEach((template, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "prompt-row";
    row.dataset.templateId = template.id;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", index === activePromptIndex ? "true" : "false");

    const title = document.createElement("span");
    title.className = "prompt-row-title";
    title.textContent = `${template.favorite ? "★ " : ""}${template.title}`;

    const meta = document.createElement("span");
    meta.className = "prompt-row-meta";
    meta.textContent = `${recentIds.includes(template.id) ? "最近使用 · " : ""}${template.category}`;

    row.append(title, meta);
    promptList.append(row);
  });
}

function filteredPromptTemplates(): PromptTemplate[] {
  const normalizedQuery = promptQuery.trim().toLowerCase();
  const recentIds = readRecentPromptIds();
  const ordered = [...promptTemplates].sort((left, right) => promptRank(right, recentIds) - promptRank(left, recentIds));
  if (!normalizedQuery) {
    return ordered;
  }

  return ordered.filter((template) => {
    const haystack = `${template.title} ${template.category} ${template.body}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function promptRank(template: PromptTemplate, recentIds: string[]): number {
  const recentIndex = recentIds.indexOf(template.id);
  const recentScore = recentIndex === -1 ? 0 : 100 - recentIndex;
  return recentScore + (template.favorite ? 10 : 0);
}

function handlePromptPaletteKeydown(event: KeyboardEvent): void {
  const templates = filteredPromptTemplates();
  if (templates.length === 0) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    activePromptIndex = Math.min(activePromptIndex + 1, templates.length - 1);
    renderPromptList();
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    activePromptIndex = Math.max(activePromptIndex - 1, 0);
    renderPromptList();
    return;
  }

  if (event.key === "Enter") {
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    event.preventDefault();
    void handlePromptSelection(templates[activePromptIndex].id);
  }
}

async function handlePromptSelection(templateId: string): Promise<void> {
  const template = promptTemplates.find((item) => item.id === templateId);
  if (!template) {
    return;
  }

  const context = await collectPageContext();
  const service = currentAIService();
  const text = renderPromptTemplate(template.body, context, service);
  rememberPromptTemplate(template.id);
  closePromptPalette();
  const result = await insertIntoAI(text);
  showToast(result.method === "direct" ? "Promptを挿入しました" : result.message || "Promptをコピーしました");
  setComposerExpanded(false);
}

async function collectPageContext(): Promise<PageContext> {
  const fallback = emptyPageContext();
  const response = await sendMessage({ type: Messages.GET_PAGE_CONTEXT });
  if (!response.ok || !response.pageContext) {
    return fallback;
  }

  return normalizePageContext(response.pageContext);
}

function normalizePageContext(context: PageContext): PageContext {
  return {
    title: typeof context.title === "string" ? context.title : "",
    url: typeof context.url === "string" ? context.url : "",
    selection: typeof context.selection === "string" ? context.selection : "",
    timestamp: typeof context.timestamp === "number" ? context.timestamp : Date.now()
  };
}

function emptyPageContext(): PageContext {
  return {
    title: "",
    url: "",
    selection: "",
    timestamp: Date.now()
  };
}

async function insertIntoAI(text: string) {
  const service = currentAIService();
  const response = await sendMessage({
    type: Messages.INSERT_TEXT_TO_AI,
    text,
    service,
    url: currentUrl
  });

  if (response.ok && response.insertResult) {
    return response.insertResult;
  }

  const copied = await copyTextFromSidePanel(text);
  if (copied) {
    return {
      success: true,
      method: "clipboard" as const,
      service,
      reason: "agent-unavailable" as const,
      message: response.error || "AIページと接続できないためコピーしました"
    };
  }

  return {
    success: false,
    method: "clipboard" as const,
    service,
    reason: "agent-unavailable" as const,
    message: response.error || "クリップボードへコピーできませんでした"
  };
}

async function copyTextFromSidePanel(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Some side panel contexts do not expose clipboard writes without an explicit fallback.
  }

  const response = await sendMessage({ type: Messages.COPY_TEXT, text });
  return response.ok === true;
}

function currentAIService(): AIService {
  return detectAIService(currentUrl);
}

function contextToastMessage(mode: ContextMode, result: { method: "direct" | "clipboard"; message?: string }): string {
  if (result.method === "clipboard") {
    return result.message || "入力欄が見つからないためコピーしました";
  }

  switch (mode) {
    case "url":
      return "URLを挿入しました";
    case "title_url":
    case "selection":
    case "full_context":
    case "ask_about_page":
    case "summarize_page":
      return "入力欄に挿入しました";
  }
}

function readRecentPromptIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_PROMPTS_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rememberPromptTemplate(templateId: string): void {
  const next = [templateId, ...readRecentPromptIds().filter((id) => id !== templateId)].slice(0, 6);
  localStorage.setItem(RECENT_PROMPTS_KEY, JSON.stringify(next));
}

async function loadPromptTemplates(): Promise<void> {
  const customTemplates = await getCustomPromptTemplates();
  promptTemplates = [...PROMPT_TEMPLATES, ...customTemplates];
  if (!promptPalette.hidden) {
    renderPromptList();
  }
}

function showToast(message: string): void {
  if (toastTimer !== undefined) {
    window.clearTimeout(toastTimer);
  }

  composerToast.textContent = message;
  composerToast.hidden = false;
  toastTimer = window.setTimeout(() => {
    composerToast.hidden = true;
    toastTimer = undefined;
  }, TOAST_MS);
}

async function loadConfiguredTarget(): Promise<void> {
  const target = resolveTarget(settings, settings.defaultPresetId);
  if (!target.url) {
    await showSetupState();
    return;
  }

  await loadTarget(target.id, target.label, target.url);
}

async function selectService(presetId: string): Promise<void> {
  if (isDiagnosticBusy()) {
    setStatus("Finish the active diagnostic before switching services.", "diagnostic");
    return;
  }

  const target = serviceOptions().find((option) => option.id === presetId);
  if (!target) {
    return;
  }

  const defaultChanged = settings.defaultPresetId !== target.id;
  settings.defaultPresetId = target.id;
  await loadTarget(target.id, target.label, target.url, { forceSave: defaultChanged });
}

async function moveService(sourceId: ActivePresetId, targetId: string): Promise<void> {
  if (sourceId === targetId) {
    return;
  }

  const orderedIds = orderedServiceIds({ includeHidden: true });
  const sourceIndex = orderedIds.indexOf(sourceId);
  const targetIndex = orderedIds.indexOf(targetId as ActivePresetId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }

  const [moved] = orderedIds.splice(sourceIndex, 1);
  orderedIds.splice(targetIndex, 0, moved);
  settings.serviceOrder = orderedIds;
  settings = await saveSettings(settings);
  renderServiceSwitcher();
  setStatus("Service order saved.");
}

async function hideService(serviceId: ActivePresetId): Promise<void> {
  closeServiceMenu();
  if (!settings.hiddenServiceIds.includes(serviceId)) {
    settings.hiddenServiceIds.push(serviceId);
  }

  settings.serviceOrder = orderedServiceIds({ includeHidden: true });
  const visibleOptions = serviceOptions().filter((option) => option.id !== serviceId);
  if (visibleOptions.length === 0) {
    settings.hiddenServiceIds = settings.hiddenServiceIds.filter((id) => id !== serviceId);
    setStatus("Keep at least one service in the header.");
    return;
  }

  if (settings.defaultPresetId === serviceId || settings.activePresetId === serviceId) {
    const fallback = visibleOptions[0];
    if (fallback) {
      settings.defaultPresetId = fallback.id;
      await loadTarget(fallback.id, fallback.label, fallback.url, { forceSave: true });
      setStatus(`${fallback.label} is now shown.`);
      return;
    }
  }

  settings = await saveSettings(settings);
  renderServiceSwitcher();
  setStatus("Service hidden from header.");
}

function openServiceMenu(serviceId: string): void {
  const option = serviceOptions({ includeHidden: true }).find((item) => item.id === serviceId);
  if (!option) {
    return;
  }

  menuServiceId = option.id;
  hideServiceButton.textContent = `Hide ${option.label}`;
  serviceMenu.hidden = false;
}

function closeServiceMenu(): void {
  serviceMenu.hidden = true;
  menuServiceId = null;
}

async function loadTarget(id: ActivePresetId, label: string, url: string, options: { forceSave?: boolean } = {}): Promise<void> {
  const changed = settings.activePresetId !== id || settings.lastUrlByPreset[id] !== url;
  settings.activePresetId = id;
  settings.lastUrlByPreset[id] = url;
  await loadUrl(label, url, { activePresetId: id });
  if (changed || options.forceSave) {
    await saveSettings(settings);
  }
}

async function loadUrl(label: string, url: string, options: LoadOptions): Promise<{ token: number; frameCompatibilitySessionId?: string }> {
  currentUrl = url;
  currentLabel = label;
  renderServiceSwitcher();
  fallbackServiceName.textContent = label;
  fallbackReason.textContent = defaultFallbackReason();
  fallbackPanel.hidden = true;
  setupPanel.hidden = true;

  const token = ++loadToken;
  completedLoadToken = undefined;
  timedOutLoadToken = undefined;
  const frame = replaceFrameForLoad(token, url);
  const shouldReplaceFrameCompatibilitySession =
    !!activeFrameCompatibilitySessionId || shouldStartFrameCompatibilitySession(options.activePresetId, url, options);
  const frameCompatibilitySessionId = shouldReplaceFrameCompatibilitySession
    ? await replaceFrameCompatibilitySession(options.activePresetId, url, options)
    : undefined;
  clearLoadTimers();
  setStatus(loadingStatusMessage(label, options), options.diagnostic ? "diagnostic" : "loading");
  setLoading(true);
  startElapsedTimer();
  loadNoticeTimer = window.setTimeout(() => {
    if (token !== loadToken || completedLoadToken === token) {
      return;
    }
    setStatus(loadNoticeMessage(label, options), options.diagnostic ? "diagnostic" : "loading");
    elapsedText.hidden = false;
  }, LOAD_NOTICE_MS);
  loadTimeoutTimer = window.setTimeout(() => {
    if (token !== loadToken || completedLoadToken === token) {
      return;
    }
    timedOutLoadToken = token;
    clearLoadTimers();
    setLoading(false);
    setStatus(timeoutStatusMessage(label, options), "warning");
    fallbackReason.textContent = timeoutFallbackReason(options);
    fallbackPanel.hidden = false;
    if (options.diagnostic) {
      completedLoadToken = token;
      updateActiveDiagnostic("timeout", "Timed out waiting for the frame to load.");
    }
  }, LOAD_TIMEOUT_MS);

  frame.src = url;

  return { token, frameCompatibilitySessionId };
}

async function showSetupState(): Promise<void> {
  clearLoadTimers();
  completedLoadToken = undefined;
  timedOutLoadToken = undefined;
  currentUrl = "";
  currentLabel = "";
  renderServiceSwitcher();
  fallbackPanel.hidden = true;
  setupPanel.hidden = false;
  setLoading(false);
  setStatus("Choose a side panel service in Options.", "idle");
  aiFrame.src = "about:blank";
  await endActiveFrameCompatibilitySession();
  if (settings.activePresetId !== settings.defaultPresetId) {
    settings.activePresetId = settings.defaultPresetId;
    await saveSettings(settings);
  }
}

function replaceFrameForLoad(token: number, expectedUrl: string): HTMLIFrameElement {
  const nextFrame = aiFrame.cloneNode(false) as HTMLIFrameElement;
  nextFrame.src = "about:blank";
  nextFrame.addEventListener("load", () => {
    completeLoad(token, expectedUrl);
  });
  nextFrame.addEventListener("error", () => {
    void handleFrameError(token);
  });
  aiFrame.replaceWith(nextFrame);
  aiFrame = nextFrame;
  return nextFrame;
}

async function handleFrameError(token: number): Promise<void> {
  if (token !== loadToken) {
    return;
  }

  await endActiveFrameCompatibilitySession();
  completedLoadToken = token;
  timedOutLoadToken = undefined;
  clearLoadTimers();
  setLoading(false);
  fallbackReason.textContent = defaultFallbackReason();
  fallbackPanel.hidden = false;
  if (activeDiagnostic?.token === token) {
    updateActiveDiagnostic("manual-fail", "Frame failed to load.");
    return;
  }
  setStatus(`${currentLabel || "Service"} failed to load.`, "warning");
}

function completeLoad(token: number, expectedUrl: string): void {
  if (token !== loadToken || completedLoadToken === token || expectedUrl !== currentUrl || aiFrame.src === "about:blank") {
    return;
  }

  if (canonicalUrl(aiFrame.src) !== canonicalUrl(expectedUrl)) {
    return;
  }

  const loadedAfterTimeout = timedOutLoadToken === token;
  completedLoadToken = token;
  timedOutLoadToken = undefined;
  clearLoadTimers();
  fallbackPanel.hidden = true;
  setLoading(false);
  if (activeDiagnostic?.token === token) {
    markDiagnosticAwaitingVerification(activeDiagnostic);
    setStatus("Diagnostic frame load event fired. Cross-origin frames cannot be inspected; mark the visual result.", "diagnostic");
    return;
  }
  setStatus(`${currentLabel || "Service"} ${loadedAfterTimeout ? "loaded after waiting" : "loaded"}.`, "success");
}

function markDiagnosticAwaitingVerification(diagnostic: ActiveDiagnostic): void {
  const entry = settings.diagnostics[diagnostic.key];
  if (!entry) {
    return;
  }

  settings.diagnostics[diagnostic.key] = {
    ...entry,
    message: "Load event fired. Cross-origin frames cannot be inspected; use Mark to record the visual result."
  };
  void saveSettings(settings).then((next) => {
    settings = next;
    renderDiagnostics();
  });
}

async function reloadCurrentUrl(): Promise<void> {
  if (isDiagnosticBusy()) {
    setStatus("Finish the active diagnostic before reloading.", "diagnostic");
    return;
  }

  if (!currentUrl) {
    setStatus("No URL is selected.", "warning");
    return;
  }
  await loadUrl(currentLabel || "AI service", currentUrl, { activePresetId: settings.activePresetId });
}

async function openCurrentInTab(): Promise<void> {
  if (!currentUrl) {
    return;
  }
  await chrome.tabs.create({ url: currentUrl });
}

async function openCurrentInFallbackWindow(): Promise<void> {
  if (!currentUrl) {
    return;
  }
  const response = await sendMessage({ type: Messages.OPEN_FALLBACK_WINDOW, url: currentUrl });
  setStatus(
    response.ok ? "Opened right-side fallback window." : response.error || "Could not open fallback window.",
    response.ok ? "success" : "error"
  );
}

async function replaceFrameCompatibilitySession(
  presetId: ActivePresetId,
  url: string,
  options: LoadOptions
): Promise<string | undefined> {
  await endActiveFrameCompatibilitySession();
  if (!isFrameCompatibilityTarget(presetId, url) || (options.diagnostic && !options.diagnostic.dnrEnabled)) {
    return undefined;
  }

  const response = await sendMessage({
    type: Messages.START_FRAME_COMPATIBILITY_SESSION,
    presetId,
    url,
    enabled: true
  });
  if (!response.ok || !response.frameCompatibilitySessionId) {
    return undefined;
  }

  activeFrameCompatibilitySessionId = response.frameCompatibilitySessionId;
  return activeFrameCompatibilitySessionId;
}

async function endActiveFrameCompatibilitySession(sessionId = activeFrameCompatibilitySessionId): Promise<RuntimeResponse> {
  if (!sessionId) {
    return { ok: true };
  }

  if (activeFrameCompatibilitySessionId === sessionId) {
    activeFrameCompatibilitySessionId = undefined;
  }
  return sendMessage({ type: Messages.END_FRAME_COMPATIBILITY_SESSION, sessionId });
}

function isFrameCompatibilityTarget(presetId: ActivePresetId, url: string): presetId is PresetId {
  if (!isBuiltInPresetId(presetId)) {
    return false;
  }

  try {
    return FRAME_COMPATIBILITY_DOMAINS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

function shouldStartFrameCompatibilitySession(presetId: ActivePresetId, url: string, options: LoadOptions): boolean {
  if (options.diagnostic && !options.diagnostic.dnrEnabled) {
    return false;
  }

  return isFrameCompatibilityTarget(presetId, url);
}

async function cancelActiveDiagnostic(message: string): Promise<void> {
  const diagnostic = activeDiagnostic;
  if (!diagnostic) {
    return;
  }

  if (diagnostic.token === loadToken) {
    completedLoadToken = diagnostic.token;
    timedOutLoadToken = undefined;
    clearLoadTimers();
    setLoading(false);
  }

  await finishDiagnostic(diagnostic, "manual-fail", message);
}

function currentDisplayTarget(): DisplayTarget | undefined {
  if (currentUrl) {
    return {
      id: settings.activePresetId,
      label: currentLabel || "AI service",
      url: currentUrl
    };
  }

  const target = resolveTarget(settings, settings.defaultPresetId);
  return target.url ? { id: target.id, label: target.label, url: target.url } : undefined;
}

async function restoreDisplayAfterDiagnostic(target: DisplayTarget | undefined): Promise<void> {
  if (!target?.url) {
    await showSetupState();
    return;
  }

  await loadUrl(target.label, target.url, { activePresetId: target.id });
}

async function runDiagnostic(presetId: PresetId, dnrEnabled: boolean): Promise<void> {
  const preset = BUILT_IN_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    return;
  }

  if (isDiagnosticBusy()) {
    setStatus("A diagnostic is already running. Wait for it to finish or mark the active result.", "diagnostic");
    return;
  }

  const sessionId = ++diagnosticSessionId;
  pendingDiagnosticSession = sessionId;
  renderDiagnostics();

  try {
    const returnTarget = currentDisplayTarget();
    const key = diagnosticKey(presetId, dnrEnabled);
    settings.diagnostics[key] = {
      presetId,
      url: preset.url,
      dnrEnabled,
      status: "pending",
      startedAt: Date.now(),
      message: `Diagnostic started with frame-header relaxation ${modeLabel(dnrEnabled)}.`
    };
    settings = await saveSettings(settings);
    renderDiagnostics();

    const { token, frameCompatibilitySessionId } = await loadUrl(preset.label, preset.url, {
      activePresetId: preset.id,
      diagnostic: { dnrEnabled, presetId }
    });
    if (pendingDiagnosticSession !== sessionId) {
      await endActiveFrameCompatibilitySession(frameCompatibilitySessionId);
      return;
    }

    activeDiagnostic = { key, token, sessionId, frameCompatibilitySessionId, returnTarget };
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    if (pendingDiagnosticSession === sessionId) {
      pendingDiagnosticSession = null;
      renderDiagnostics();
    }
  }
}

async function markDiagnostic(presetId: PresetId, dnrEnabled: boolean, status: DiagnosticStatus): Promise<void> {
  const key = diagnosticKey(presetId, dnrEnabled);
  const entry = settings.diagnostics[key];
  const preset = BUILT_IN_PRESETS.find((item) => item.id === presetId);
  const active = activeDiagnostic?.key === key ? activeDiagnostic : null;
  if (isDiagnosticBusy() && !active) {
    setStatus("Wait for the active diagnostic before marking another result.", "diagnostic");
    return;
  }

  if (active) {
    completedLoadToken = active.token;
    timedOutLoadToken = undefined;
    clearLoadTimers();
    setLoading(false);
  }

  if (active) {
    await finishDiagnostic(active, status, status === "manual-pass" ? "Marked visible by user." : "Marked failed by user.");
    return;
  }

  settings.diagnostics[key] = {
    presetId,
    dnrEnabled,
    url: entry?.url || preset?.url || "",
    status,
    startedAt: entry?.startedAt || Date.now(),
    finishedAt: Date.now(),
    message: status === "manual-pass" ? "Marked visible by user." : "Marked failed by user."
  };
  settings = await saveSettings(settings);
  renderDiagnostics();
  setStatus("Diagnostic result saved.", "success");
}

function updateActiveDiagnostic(status: DiagnosticStatus, message?: string): boolean {
  const diagnostic = activeDiagnostic;
  if (!diagnostic || diagnostic.token !== loadToken) {
    return false;
  }

  const entry = settings.diagnostics[diagnostic.key];
  if (!entry) {
    return false;
  }

  void finishDiagnostic(diagnostic, status, message);
  return true;
}

async function finishDiagnostic(diagnostic: ActiveDiagnostic, status: DiagnosticStatus, message?: string): Promise<void> {
  if (activeDiagnostic?.sessionId === diagnostic.sessionId) {
    activeDiagnostic = null;
  }

  finalizingDiagnosticSession = diagnostic.sessionId;
  renderDiagnostics();
  setStatus("Diagnostic result saved. Restoring the previous service...", "diagnostic");

  try {
    const entry = settings.diagnostics[diagnostic.key];
    if (entry) {
      settings.diagnostics[diagnostic.key] = {
        ...entry,
        status,
        finishedAt: Date.now(),
        message
      };
      settings = await saveSettings(settings);
      renderDiagnostics();
    }
    const restoreResponse = await endActiveFrameCompatibilitySession(diagnostic.frameCompatibilitySessionId);
    if (restoreResponse.ok && restoreResponse.settings) {
      settings = restoreResponse.settings;
      syncSettingsUi();
    } else if (!restoreResponse.ok) {
      setStatus(restoreResponse.error || "Diagnostic saved, but frame-header relaxation could not be restored.", "error");
    }
    await restoreDisplayAfterDiagnostic(diagnostic.returnTarget);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    await endActiveFrameCompatibilitySession(diagnostic.frameCompatibilitySessionId).catch(() => undefined);
    await restoreDisplayAfterDiagnostic(diagnostic.returnTarget);
  } finally {
    if (finalizingDiagnosticSession === diagnostic.sessionId) {
      finalizingDiagnosticSession = null;
      renderDiagnostics();
    }
  }
}

function syncSettingsUi(): void {
  moreActionsButton.title = "Open settings";
  moreActionsButton.setAttribute("aria-label", "Open settings");
  syncSidePanelChromeUi();
  renderServiceSwitcher();
  renderDiagnostics();
}

function syncSidePanelChromeUi(): void {
  const headerCollapsed = settings.sidePanelChrome.headerCollapsed;
  const footerCollapsed = settings.sidePanelChrome.footerCollapsed;

  app.dataset.headerCollapsed = headerCollapsed ? "true" : "false";
  app.dataset.footerCollapsed = footerCollapsed ? "true" : "false";
  serviceSwitcher.setAttribute("aria-hidden", headerCollapsed ? "true" : "false");
  serviceMenu.setAttribute("aria-hidden", headerCollapsed ? "true" : "false");
  headerReloadButton.title = "Reload current service";
  headerReloadButton.setAttribute("aria-label", "Reload current service");
  headerReloadButton.setAttribute("aria-hidden", headerCollapsed ? "true" : "false");
  composerActions.setAttribute("aria-hidden", footerCollapsed ? "true" : "false");
  moreActionsButton.setAttribute("aria-hidden", footerCollapsed ? "true" : "false");

  const headerLabel = headerCollapsed ? "Expand header" : "Collapse header";
  headerChromeToggleButton.title = headerLabel;
  headerChromeToggleButton.setAttribute("aria-label", headerLabel);
  headerChromeToggleButton.setAttribute("aria-expanded", headerCollapsed ? "false" : "true");

  const footerLabel = footerCollapsed ? "Expand footer" : "Collapse footer";
  footerChromeToggleButton.title = footerLabel;
  footerChromeToggleButton.setAttribute("aria-label", footerLabel);
  footerChromeToggleButton.setAttribute("aria-expanded", footerCollapsed ? "false" : "true");
}

async function setSidePanelChromeCollapsed(area: "header" | "footer", collapsed: boolean): Promise<void> {
  const key = area === "header" ? "headerCollapsed" : "footerCollapsed";
  if (settings.sidePanelChrome[key] === collapsed) {
    return;
  }

  if (area === "header" && collapsed) {
    closeServiceMenu();
  }

  if (area === "footer" && collapsed) {
    closeComposerMenus();
  }

  settings = await saveSettings({
    ...settings,
    sidePanelChrome: {
      ...settings.sidePanelChrome,
      [key]: collapsed
    }
  });
  syncSettingsUi();
}

function renderServiceSwitcher(): void {
  serviceSwitcher.textContent = "";

  for (const option of serviceOptions()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "service-button";
    button.draggable = true;
    button.dataset.presetId = option.id;
    button.title = option.url ? `${option.label}: ${option.url}. Drag to reorder. Right-click to hide.` : option.label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-label", `Open ${option.label}`);
    button.setAttribute("aria-selected", isActiveService(option) ? "true" : "false");

    if (option.iconSrc) {
      const icon = document.createElement("img");
      icon.src = option.iconSrc;
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
    } else {
      const badge = document.createElement("span");
      badge.className = "service-fallback-icon";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = serviceInitial(option.label);
      button.append(badge);
    }

    const label = document.createElement("span");
    label.className = "service-label";
    label.textContent = option.label;
    button.append(label);
    serviceSwitcher.append(button);
  }
}

function serviceOptions(options: { includeHidden?: boolean } = {}): ServiceOption[] {
  const visibleIds = orderedServiceIds({ includeHidden: options.includeHidden === true });
  const visibleIdSet = new Set(visibleIds);
  const builtIns = BUILT_IN_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    url: settings.lastUrlByPreset[preset.id] || preset.url,
    iconSrc: SERVICE_ICON_SRC[preset.id],
    isCustom: false
  }));
  const custom = settings.customUrls.map((customUrl) => {
    const id = makeCustomPresetId(customUrl.id);
    return {
      id,
      label: customUrl.label,
      url: settings.lastUrlByPreset[id] || customUrl.url,
      iconSrc: customUrl.iconUrl,
      isCustom: true
    };
  });

  const byId = new Map<ActivePresetId, ServiceOption>(
    [...builtIns, ...custom].map((option) => [option.id, option])
  );
  return visibleIds
    .filter((id) => visibleIdSet.has(id))
    .map((id) => byId.get(id))
    .filter((option): option is ServiceOption => !!option);
}

function orderedServiceIds(options: { includeHidden: boolean }): ActivePresetId[] {
  const availableIds: ActivePresetId[] = [
    ...BUILT_IN_PRESETS.map((preset) => preset.id),
    ...settings.customUrls.map((customUrl) => makeCustomPresetId(customUrl.id))
  ];
  const availableSet = new Set<ActivePresetId>(availableIds);
  const ordered = [
    ...settings.serviceOrder.filter((id) => availableSet.has(id)),
    ...availableIds.filter((id) => !settings.serviceOrder.includes(id))
  ];
  return options.includeHidden ? ordered : ordered.filter((id) => !settings.hiddenServiceIds.includes(id));
}

function isActiveService(option: ServiceOption): boolean {
  return settings.activePresetId === option.id || (!!currentUrl && canonicalUrl(currentUrl) === canonicalUrl(option.url));
}

function serviceInitial(label: string): string {
  return (label.trim().match(/[A-Za-z0-9]/)?.[0] || label.trim().charAt(0) || "?").toUpperCase();
}

function isDiagnosticBusy(): boolean {
  return pendingDiagnosticSession !== null || activeDiagnostic !== null || finalizingDiagnosticSession !== null;
}

function renderDiagnostics(): void {
  diagnosticsTable.textContent = "";
  if (!diagnosticsEnabled) {
    return;
  }

  for (const preset of BUILT_IN_PRESETS) {
    const row = document.createElement("tr");
    row.append(cell(preset.label));
    row.append(statusCell(settings.diagnostics[diagnosticKey(preset.id, false)]));
    row.append(statusCell(settings.diagnostics[diagnosticKey(preset.id, true)]));
    row.append(runButtons(preset.id));
    row.append(markButtons(preset.id));
    diagnosticsTable.append(row);
  }
}

function statusCell(entry: DiagnosticEntry | undefined): HTMLTableCellElement {
  const td = document.createElement("td");
  const span = document.createElement("span");
  const status = entry?.status || "untested";
  span.className = `status-pill status-${status}`;
  span.textContent = status.replace("manual-", "");
  td.append(span);
  return td;
}

function runButtons(presetId: PresetId): HTMLTableCellElement {
  const td = document.createElement("td");
  const wrap = document.createElement("div");
  wrap.className = "mini-actions";
  wrap.append(diagnosticButton("Run skipped", presetId, false, "runDnr"));
  wrap.append(diagnosticButton("Run applied", presetId, true, "runDnr"));
  td.append(wrap);
  return td;
}

function markButtons(presetId: PresetId): HTMLTableCellElement {
  const td = document.createElement("td");
  const wrap = document.createElement("div");
  wrap.className = "mini-actions";
  wrap.append(markButton("Skipped visible", presetId, false, "manual-pass"));
  wrap.append(markButton("Skipped blocked", presetId, false, "manual-fail"));
  wrap.append(markButton("Applied visible", presetId, true, "manual-pass"));
  wrap.append(markButton("Applied blocked", presetId, true, "manual-fail"));
  td.append(wrap);
  return td;
}

function diagnosticButton(label: string, presetId: PresetId, dnrEnabled: boolean, dataKey: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.presetId = presetId;
  button.dataset[dataKey] = String(dnrEnabled);
  if (dataKey === "runDnr" && isDiagnosticBusy()) {
    button.disabled = true;
  }
  return button;
}

function markButton(label: string, presetId: PresetId, dnrEnabled: boolean, status: DiagnosticStatus): HTMLButtonElement {
  const button = diagnosticButton(label, presetId, dnrEnabled, "markDnr");
  button.dataset.markStatus = status;
  if (isDiagnosticBusy() && activeDiagnostic?.key !== diagnosticKey(presetId, dnrEnabled)) {
    button.disabled = true;
  }
  return button;
}

function cell(text: string): HTMLTableCellElement {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

async function sendMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function clearLoadTimers(): void {
  if (loadNoticeTimer !== undefined) {
    window.clearTimeout(loadNoticeTimer);
    loadNoticeTimer = undefined;
  }
  if (loadTimeoutTimer !== undefined) {
    window.clearTimeout(loadTimeoutTimer);
    loadTimeoutTimer = undefined;
  }
  if (elapsedTimer !== undefined) {
    window.clearInterval(elapsedTimer);
    elapsedTimer = undefined;
  }
  elapsedText.hidden = true;
  elapsedText.textContent = "";
}

function setLoading(loading: boolean): void {
  loadingSpinner.hidden = !loading;
  if (!loading) {
    elapsedText.hidden = true;
  }
}

function startElapsedTimer(): void {
  loadStartedAt = Date.now();
  updateElapsedText();
  elapsedText.hidden = true;
  elapsedTimer = window.setInterval(updateElapsedText, 1000);
}

function updateElapsedText(): void {
  const seconds = Math.max(0, Math.floor((Date.now() - loadStartedAt) / 1000));
  elapsedText.textContent = `${seconds}s`;
}

function loadingStatusMessage(label: string, options: LoadOptions): string {
  if (options.diagnostic) {
    return `Diagnostic: loading ${label} with frame-header relaxation ${modeLabel(options.diagnostic.dnrEnabled)}.`;
  }

  return `Loading ${label}...`;
}

function loadNoticeMessage(label: string, options: LoadOptions): string {
  if (options.diagnostic) {
    return `Diagnostic is still loading ${label} with frame-header relaxation ${modeLabel(options.diagnostic.dnrEnabled)}.`;
  }

  return `${label} is still loading. You can keep waiting or open it outside the frame.`;
}

function timeoutStatusMessage(label: string, options: LoadOptions): string {
  if (options.diagnostic) {
    return `Diagnostic timed out for ${label} with frame-header relaxation ${modeLabel(options.diagnostic.dnrEnabled)}.`;
  }

  return `${label} timed out. Fallback options are available.`;
}

function timeoutFallbackReason(options: LoadOptions): string {
  const timing = `The frame did not finish loading within ${Math.round(LOAD_TIMEOUT_MS / 1000)} seconds.`;
  if (options.diagnostic) {
    return `${timing} This diagnostic result was saved as a timeout, and anyside will restore the previous service.`;
  }

  return `${timing} Sign-in, cookies, or embed restrictions may be blocking the frame. Try again, or open it in a side window.`;
}

function defaultFallbackReason(): string {
  return "Sign-in, cookies, or embed restrictions can block the frame. Try again, or open it in a side window when the frame stays blank.";
}

function modeLabel(enabled: boolean): string {
  return enabled ? "applied" : "skipped";
}

function canonicalUrl(value: string): string {
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

function setStatus(text: string, tone: StatusTone = "idle"): void {
  statusText.textContent = text;
  statusLive.dataset.tone = tone;
  statusBanner.dataset.tone = tone;
  statusBannerText.textContent = text;
  const showBanner = shouldShowStatusBanner(tone, text);
  statusBanner.hidden = !showBanner;
  statusBanner.setAttribute("aria-hidden", showBanner ? "false" : "true");

  if (tone === "loading" || tone === "diagnostic") {
    loadingSpinner.hidden = false;
    return;
  }

  loadingSpinner.hidden = true;
}

function shouldShowStatusBanner(tone: StatusTone, text: string): boolean {
  if (!text) {
    return false;
  }

  return tone === "loading" || tone === "warning" || tone === "error" || (tone === "diagnostic" && diagnosticsEnabled);
}

function isDebugMode(): boolean {
  const debug = new URLSearchParams(window.location.search).get("debug");
  return debug !== null && debug !== "0" && debug.toLowerCase() !== "false";
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element: ${id}`);
  }
  return found as T;
}
