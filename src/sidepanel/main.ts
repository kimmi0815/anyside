import { Messages } from "../shared/messages.js";
import { PROMPT_TEMPLATES, detectAIService, getContextActions, renderContextTemplate, renderPromptTemplate } from "../features/composer/index.js";
import { BUILT_IN_PRESETS, FRAME_COMPATIBILITY_DOMAINS, diagnosticKey, isBuiltInPresetId, makeCustomPresetId, resolveTarget } from "../shared/presets.js";
import { getSettings, normalizeSettings, saveSettings, SETTINGS_KEY } from "../shared/storage.js";
import { CUSTOM_PROMPT_TEMPLATES_KEY, getCustomPromptTemplates } from "../storage/promptTemplateStorage.js";
import { resolveLanguage, t, type ResolvedLanguage } from "../shared/i18n.js";
import { PENDING_CONTEXT_SHELF_ITEMS_KEY, normalizePendingContextShelfItems } from "../shared/contextShelfSession.js";
import type { AIService, ContextMode, PageContext, PromptTemplate } from "../features/composer/types.js";
import type { ActivePresetId, DiagnosticEntry, DiagnosticStatus, PresetId, RuntimeMessage, RuntimeResponse, Settings } from "../shared/types.js";

const LOAD_NOTICE_MS = 4500;
const LOAD_TIMEOUT_MS = 8000;
const TOAST_MS = 2200;
const TOAST_EXIT_MS = 180;
const RECENT_PROMPTS_KEY = "composer.recentPromptTemplateIds";
const CONTEXT_SHELF_KEY = "composer.contextShelfItems";
const PROMPT_DRAFT_KEY = "composer.promptDraft";
const PROMPT_DRAFT_TARGET_KEY = "composer.promptDraftTarget";
const CONTEXT_SHELF_LIMIT = 20;
const DRAFT_TRY_LOAD_WAIT_MS = 2600;
const AI_FRAME_ALLOW = "clipboard-write";
const SERVICE_ICON_SRC: Partial<Record<PresetId, string>> = {
  chatgpt: "../../assets/service-icons/chatgpt.png",
  gemini: "../../assets/service-icons/gemini.png",
  claude: "../../assets/service-icons/claude.png",
  perplexity: "../../assets/service-icons/perplexity.svg",
  notebooklm: "../../assets/service-icons/notebooklm.svg",
  grok: "../../assets/service-icons/grok.png",
  copilot: "../../assets/service-icons/copilot.svg",
  deepseek: "../../assets/service-icons/deepseek.ico",
  kimi: "../../assets/service-icons/kimi.ico",
  minimax: "../../assets/service-icons/minimax.ico",
  glm: "../../assets/service-icons/glm.svg",
  manus: "../../assets/service-icons/manus.png",
  genspark: "../../assets/service-icons/genspark.png"
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
const frameDeck = element<HTMLElement>("frameDeck");
let aiFrame = element<HTMLIFrameElement>("aiFrame");
const dismissLayer = element<HTMLButtonElement>("dismissLayer");
const fallbackPanel = element<HTMLElement>("fallbackPanel");
const fallbackServiceName = element<HTMLElement>("fallbackServiceName");
const fallbackTitleSuffix = element<HTMLElement>("fallbackTitleSuffix");
const fallbackReason = element<HTMLElement>("fallbackReason");
const fallbackNote = element<HTMLElement>("fallbackNote");
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
const addContextToShelfButton = element<HTMLButtonElement>("addContextToShelfButton");
const shelfButton = element<HTMLButtonElement>("shelfButton");
const contextShelfPanel = element<HTMLElement>("contextShelfPanel");
const contextShelfTitle = element<HTMLElement>("contextShelfTitle");
const contextShelfList = element<HTMLElement>("contextShelfList");
const copyShelfButton = element<HTMLButtonElement>("copyShelfButton");
const clearShelfButton = element<HTMLButtonElement>("clearShelfButton");
const promptDraftPanel = element<HTMLElement>("promptDraftPanel");
const promptDraftTitle = element<HTMLElement>("promptDraftTitle");
const promptDraftTextarea = element<HTMLTextAreaElement>("promptDraftTextarea");
const draftTargetSelect = element<HTMLSelectElement>("draftTargetSelect");
const tryDraftButton = element<HTMLButtonElement>("tryDraftButton");
const insertDraftButton = element<HTMLButtonElement>("insertDraftButton");
const copyDraftButton = element<HTMLButtonElement>("copyDraftButton");
const clearDraftButton = element<HTMLButtonElement>("clearDraftButton");
const diagnosticsDetails = element<HTMLDetailsElement>("diagnosticsDetails");
const diagnosticsTable = element<HTMLTableSectionElement>("diagnosticsTable");
const diagnosticsEnabled = isDebugMode();

type StatusTone = "idle" | "loading" | "success" | "warning" | "error" | "diagnostic";
type DisplayTarget = { id: ActivePresetId; label: string; url: string };
type ServiceOption = DisplayTarget & { iconSrc?: string; isCustom: boolean };
type LoadOptions = { activePresetId: ActivePresetId; diagnostic?: { dnrEnabled: boolean; presetId: PresetId }; forceReload?: boolean };
type PreservedFrame = { frame: HTMLIFrameElement; sourceUrl: string; loaded: boolean };
type ContextShelfItem = {
  id: string;
  title: string;
  subtitle: string;
  text: string;
  createdAt: number;
};
type ActiveDiagnostic = {
  key: string;
  token: number;
  sessionId: number;
  frameCompatibilitySessionId?: string;
  returnTarget?: DisplayTarget;
};

let settings: Settings;
let uiLanguage: ResolvedLanguage = "en";
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
const expandedPromptCategories = new Set<string>();
let toastTimer: number | undefined;
let toastExitTimer: number | undefined;
let composerCollapsed = true;
let promptTemplates: PromptTemplate[] = [...PROMPT_TEMPLATES];
let draggedServiceId: ActivePresetId | null = null;
let menuServiceId: ActivePresetId | null = null;
let contextShelfItems: ContextShelfItem[] = [];
const preservedFrames = new Map<ActivePresetId, PreservedFrame>();
let diagnosticFrame: HTMLIFrameElement | null = null;

void init();

async function init(): Promise<void> {
  diagnosticsDetails.hidden = !diagnosticsEnabled;
  settings = await getSettings();
  uiLanguage = resolveUiLanguage();
  contextShelfItems = readContextShelfItems();
  promptDraftTextarea.value = readPromptDraft();
  await loadPromptTemplates();
  syncSettingsUi();
  bindEvents();
  await drainPendingContextShelfItems();

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
    if (areaName === "session") {
      if (changes[PENDING_CONTEXT_SHELF_ITEMS_KEY]?.newValue) {
        void drainPendingContextShelfItems();
      }
      return;
    }

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
    uiLanguage = resolveUiLanguage();
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
    if (!composerCollapsed) {
      closeComposerMenus();
      return;
    }
    setComposerExpanded(true);
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
  addContextToShelfButton.addEventListener("click", () => {
    void handleAddCurrentContextToShelf();
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
    const categoryToggle = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-prompt-category]") : null;
    if (categoryToggle?.dataset.promptCategory) {
      event.stopPropagation();
      togglePromptCategory(categoryToggle.dataset.promptCategory);
      return;
    }

    const draftTarget = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-template-draft-id]") : null;
    if (draftTarget) {
      event.stopPropagation();
      openPromptTemplateDraft(draftTarget.dataset.templateDraftId || "");
      return;
    }

    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-template-id]") : null;
    if (!target) {
      return;
    }
    void handlePromptSelection(target.dataset.templateId || "");
  });
  shelfButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!contextShelfPanel.hidden) {
      closeComposerMenus();
      return;
    }
    openContextShelfPanel();
  });
  contextShelfList.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-shelf-action][data-shelf-id]") : null;
    if (!target) {
      return;
    }
    void handleShelfAction(target.dataset.shelfAction || "", target.dataset.shelfId || "");
  });
  copyShelfButton.addEventListener("click", () => {
    void handleShelfAction("copy", "all");
  });
  clearShelfButton.addEventListener("click", () => clearContextShelf());
  promptDraftTextarea.addEventListener("input", () => savePromptDraft(promptDraftTextarea.value));
  draftTargetSelect.addEventListener("change", () => {
    savePromptDraftTarget(draftTargetSelect.value);
  });
  insertDraftButton.addEventListener("click", () => {
    void insertPromptDraft();
  });
  copyDraftButton.addEventListener("click", () => {
    void copyPromptDraft();
  });
  clearDraftButton.addEventListener("click", () => clearPromptDraft());
  tryDraftButton.addEventListener("click", () => {
    void tryPromptDraftInSelectedService();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    const inContextPopover = contextPopover.contains(target);
    const inPromptPalette = promptPalette.contains(target);
    const inContextShelf = contextShelfPanel.contains(target);
    const inPromptDraft = promptDraftPanel.contains(target);
    const inComposerToolbar = composerToolbar.contains(target);
    if (!serviceMenu.contains(target)) {
      closeServiceMenu();
    }
    if (!inContextPopover && !inComposerToolbar) {
      closeContextPopover();
    }
    if (!inPromptPalette && !inComposerToolbar) {
      closePromptPalette();
    }
    if (!inContextShelf && !inComposerToolbar && !inContextPopover) {
      closeContextShelfPanel();
    }
    if (!inPromptDraft && !inComposerToolbar && !inContextPopover && !inContextShelf) {
      closePromptDraftPanel();
    }
    if (!inContextPopover && !inPromptPalette && !inContextShelf && !inPromptDraft && !inComposerToolbar) {
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
  closeContextShelfPanel();
  closePromptDraftPanel();
  setComposerExpanded(true);
  contextButton.setAttribute("aria-expanded", "true");
  contextPopover.hidden = false;
  contextPopover.dataset.open = "true";
  syncDismissLayer();
  lastContext = await collectPageContext();
  renderContextActions(lastContext);
}

function closeContextPopover(): void {
  delete contextPopover.dataset.open;
  contextPopover.hidden = true;
  contextButton.setAttribute("aria-expanded", "false");
  syncDismissLayer();
}

function closeComposerMenus(): void {
  closeContextPopover();
  closePromptPalette();
  closeContextShelfPanel();
  closePromptDraftPanel();
  setComposerExpanded(false);
}

function syncDismissLayer(): void {
  dismissLayer.hidden = contextPopover.hidden && promptPalette.hidden && contextShelfPanel.hidden && promptDraftPanel.hidden;
}

function renderContextActions(context: PageContext): void {
  contextActions.textContent = "";
  const selectionLength = context.selection.trim().length;
  contextSummary.textContent = selectionLength > 0 ? tr("side.selectionSummary", { count: selectionLength }) : tr("side.noSelection");

  for (const action of getContextActions(uiLanguage)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.mode = action.mode;
    button.textContent = contextActionLabel(action.mode, action.label);
    if (action.requiresSelection && selectionLength === 0) {
      button.title = tr("side.noSelectionTitle");
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    }
    contextActions.append(button);
  }
}

async function handleContextAction(mode: ContextMode): Promise<void> {
  const context = contextModeUsesPageText(mode)
    ? await collectPageContext({ includePageText: true })
    : lastContext || await collectPageContext();
  lastContext = context;
  if (mode === "selection" && !context.selection.trim()) {
    showToast(tr("side.noSelectionTitle"));
    return;
  }
  if (contextModeUsesPageText(mode) && !context.pageText?.trim()) {
    showToast(uiText("Page body is unavailable on this page.", "このページの本文を取得できませんでした"));
    return;
  }

  const text = renderSidePanelContextTemplate(context, mode, uiLanguage);
  if (!text) {
    showToast(tr("side.contextUnavailable"));
    return;
  }

  closeContextPopover();
  const result = await insertIntoAI(text);
  showToast(contextToastMessage(mode, result));
  setComposerExpanded(false);
}

function openPromptPalette(): void {
  closeContextPopover();
  closeContextShelfPanel();
  closePromptDraftPanel();
  setComposerExpanded(true);
  promptButton.setAttribute("aria-expanded", "true");
  promptPalette.hidden = false;
  promptPalette.dataset.open = "true";
  syncDismissLayer();
  promptQuery = promptSearchInput.value;
  activePromptIndex = 0;
  renderPromptList();
  void loadPromptTemplates();
  window.setTimeout(() => promptSearchInput.focus(), 0);
}

function closePromptPalette(): void {
  delete promptPalette.dataset.open;
  promptPalette.hidden = true;
  promptButton.setAttribute("aria-expanded", "false");
  syncDismissLayer();
}

function openContextShelfPanel(): void {
  closeContextPopover();
  closePromptPalette();
  closePromptDraftPanel();
  setComposerExpanded(true);
  shelfButton.setAttribute("aria-expanded", "true");
  contextShelfPanel.hidden = false;
  contextShelfPanel.dataset.open = "true";
  renderContextShelf();
  syncDismissLayer();
}

function closeContextShelfPanel(): void {
  delete contextShelfPanel.dataset.open;
  contextShelfPanel.hidden = true;
  shelfButton.setAttribute("aria-expanded", "false");
  syncDismissLayer();
}

function openPromptDraftPanel(): void {
  closeContextPopover();
  closePromptPalette();
  closeContextShelfPanel();
  setComposerExpanded(true);
  promptDraftPanel.hidden = false;
  promptDraftPanel.dataset.open = "true";
  renderDraftTargetOptions();
  syncDismissLayer();
  window.setTimeout(() => promptDraftTextarea.focus(), 0);
}

function closePromptDraftPanel(): void {
  delete promptDraftPanel.dataset.open;
  promptDraftPanel.hidden = true;
  syncDismissLayer();
}

function renderPromptList(): void {
  promptList.textContent = "";
  const templates = filteredPromptTemplates();
  if (templates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "composer-empty";
    empty.textContent = promptTemplates.length === 0 ? tr("side.noPrompts") : tr("side.noPromptMatches");
    promptList.append(empty);
    return;
  }

  const recentIds = readRecentPromptIds();
  const visibleTemplates = visiblePromptTemplates(templates);
  if (visibleTemplates.length > 0) {
    activePromptIndex = Math.max(0, Math.min(activePromptIndex, visibleTemplates.length - 1));
  } else {
    activePromptIndex = 0;
  }
  const templateIndex = new Map(visibleTemplates.map((template, index) => [template.id, index]));
  const expandMatches = promptQuery.trim().length > 0;
  for (const group of groupPromptTemplatesByCategory(templates)) {
    const isExpanded = expandMatches || expandedPromptCategories.has(group.category);
    const groupElement = document.createElement("section");
    groupElement.className = "prompt-category-group";
    groupElement.dataset.promptCategoryGroup = group.category;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "prompt-category-toggle";
    toggle.dataset.promptCategory = group.category;
    toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");

    const label = document.createElement("span");
    label.className = "prompt-category-label";
    label.textContent = group.category;

    const count = document.createElement("span");
    count.className = "prompt-category-count";
    count.textContent = String(group.templates.length);
    toggle.append(label, count);

    const items = document.createElement("div");
    items.className = "prompt-category-items";
    items.hidden = !isExpanded;

    for (const template of group.templates) {
      const index = templateIndex.get(template.id) ?? -1;
      const row = document.createElement("div");
      row.className = "prompt-row";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", index === activePromptIndex ? "true" : "false");

      const main = document.createElement("button");
      main.type = "button";
      main.className = "prompt-row-main";
      main.dataset.templateId = template.id;

      const title = document.createElement("span");
      title.className = "prompt-row-title";
      title.textContent = `${template.favorite ? "★ " : ""}${template.title}`;

      const meta = document.createElement("span");
      meta.className = "prompt-row-meta";
      meta.textContent = `${recentIds.includes(template.id) ? `${tr("side.recent")} · ` : ""}${template.category}`;

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "prompt-row-edit";
      edit.dataset.templateDraftId = template.id;
      edit.textContent = uiText("Edit", "編集");
      edit.title = uiText("Edit temporarily", "一時編集");
      edit.setAttribute("aria-label", uiText(`Edit ${template.title} temporarily`, `${template.title}を一時編集`));

      main.append(title, meta);
      row.append(main, edit);
      items.append(row);
    }
    groupElement.append(toggle, items);
    promptList.append(groupElement);
  }
}

function togglePromptCategory(category: string): void {
  if (expandedPromptCategories.has(category)) {
    expandedPromptCategories.delete(category);
  } else {
    expandedPromptCategories.add(category);
  }
  renderPromptList();
}

function visiblePromptTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  if (promptQuery.trim()) {
    return templates;
  }
  return templates.filter((template) => expandedPromptCategories.has(template.category.trim() || uiText("Custom", "カスタム")));
}

function groupPromptTemplatesByCategory(templates: PromptTemplate[]): { category: string; templates: PromptTemplate[] }[] {
  const groups = new Map<string, PromptTemplate[]>();
  for (const template of templates) {
    const category = template.category.trim() || uiText("Custom", "カスタム");
    const existing = groups.get(category) ?? [];
    existing.push(template);
    groups.set(category, existing);
  }
  return [...groups.entries()].map(([category, groupedTemplates]) => ({ category, templates: groupedTemplates }));
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
  const templates = visiblePromptTemplates(filteredPromptTemplates());
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

  const context = withPromptDraftContext(await collectPageContext({ includePageText: promptBodyNeedsExtractedPageText(template.body) }));
  const service = currentAIService();
  const text = renderPromptTemplate(template.body, context, service, uiLanguage);
  rememberPromptTemplate(template.id);
  closePromptPalette();
  const result = await insertIntoAI(text);
  showToast(result.method === "direct" ? tr("side.promptInserted") : result.message || tr("side.promptCopied"));
  setComposerExpanded(false);
}

function openPromptTemplateDraft(templateId: string): void {
  const template = promptTemplates.find((item) => item.id === templateId);
  if (!template) {
    return;
  }

  setPromptDraft(template.body);
  rememberPromptTemplate(template.id);
  openPromptDraftPanel();
}

async function collectPageContext(options: { includePageText?: boolean } = {}): Promise<PageContext> {
  const fallback = emptyPageContext();
  const response = await sendMessage({ type: Messages.GET_PAGE_CONTEXT });
  if (!response.ok || !response.pageContext) {
    return options.includePageText ? enrichPageContextWithPageText(fallback) : fallback;
  }

  const context = normalizePageContext(response.pageContext);
  return options.includePageText ? enrichPageContextWithPageText(context) : context;
}

function normalizePageContext(context: PageContext): PageContext {
  const url = typeof context.url === "string" ? context.url : "";
  const headings = Array.isArray(context.headings)
    ? context.headings.filter((heading): heading is string => typeof heading === "string").map((heading) => heading.trim()).filter(Boolean)
    : undefined;
  return {
    title: typeof context.title === "string" ? context.title : "",
    url,
    selection: typeof context.selection === "string" ? context.selection : "",
    timestamp: typeof context.timestamp === "number" ? context.timestamp : Date.now(),
    domain: typeof context.domain === "string" ? context.domain : domainFromContextUrl(url),
    headings,
    draft: typeof context.draft === "string" ? context.draft : undefined,
    pageText: typeof context.pageText === "string" ? context.pageText : undefined,
    pageTextSource: normalizePageTextSource(context.pageTextSource),
    pageTextTruncated: typeof context.pageTextTruncated === "boolean" ? context.pageTextTruncated : undefined,
    pageTextLimit: typeof context.pageTextLimit === "number" ? context.pageTextLimit : undefined
  };
}

function withPromptDraftContext(context: PageContext): PageContext {
  return {
    ...context,
    draft: currentPromptDraftText()
  };
}

function emptyPageContext(): PageContext {
  return {
    title: "",
    url: "",
    selection: "",
    timestamp: Date.now(),
    domain: ""
  };
}

async function enrichPageContextWithPageText(context: PageContext): Promise<PageContext> {
  const response = await sendMessage({ type: Messages.EXTRACT_ACTIVE_TAB_PAGE_TEXT });
  if (!response.ok || !response.extractedPageContext) {
    return context;
  }

  const extracted = response.extractedPageContext;
  const source = normalizePageTextSource(extracted.source);
  return normalizePageContext({
    ...context,
    title: extracted.title || context.title,
    url: extracted.url || context.url,
    domain: extracted.domain || context.domain,
    headings: extracted.headings,
    selection: extracted.selection || context.selection,
    pageText: extracted.pageText,
    pageTextSource: source,
    pageTextTruncated: Boolean(extracted.truncated?.pageText),
    timestamp: extracted.timestamp || context.timestamp
  });
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
      message: response.error || tr("side.aiDisconnected")
    };
  }

  return {
    success: false,
    method: "clipboard" as const,
    service,
    reason: "agent-unavailable" as const,
    message: response.error || tr("side.copyFailed")
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
    return result.message || tr("side.noInputCopied");
  }

  switch (mode) {
    case "url":
      return uiLanguage === "ja" ? "URLを挿入しました" : "Inserted URL.";
    case "title_url":
    case "selection":
    case "full_context":
    case "ask_about_page":
    case "summarize_page":
    case "page_text":
    case "summarize_page_with_text":
      return uiLanguage === "ja" ? "入力欄に挿入しました" : "Inserted into the input.";
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

async function handleAddCurrentContextToShelf(): Promise<void> {
  const context = await collectPageContext({ includePageText: true });
  lastContext = context;
  const items = createContextShelfItems(context);
  if (items.length === 0) {
    showToast(tr("side.contextUnavailable"));
    return;
  }

  addContextShelfItems(items);
  closeContextPopover();
  openContextShelfPanel();
  showToast(tr("side.shelfAdded"));
}

function createContextShelfItems(context: PageContext): ContextShelfItem[] {
  const items: ContextShelfItem[] = [];
  const titleUrl = renderContextTemplate(context, "title_url", uiLanguage);
  if (titleUrl) {
    items.push(createContextShelfItem(context, titleUrl, uiText("Title + URL", "タイトル + URL")));
  }
  if (context.selection.trim()) {
    items.push(createContextShelfItem(context, context.selection.trim(), uiText("Selection", "選択テキスト")));
  }
  if (context.pageText?.trim()) {
    items.push(createContextShelfItem(
      context,
      renderSidePanelContextTemplate(context, "page_text", uiLanguage),
      uiText("Page body", "本文")
    ));
  }
  return items;
}

function createContextShelfItem(context: PageContext, text: string, label: string): ContextShelfItem {
  return {
    id: makeLocalId(),
    title: label,
    subtitle: contextShelfSubtitle(context),
    text,
    createdAt: Date.now()
  };
}

function addContextShelfItems(items: ContextShelfItem[]): void {
  contextShelfItems = [
    ...items,
    ...contextShelfItems.filter((existing) => !items.some((item) => item.text === existing.text))
  ].slice(0, CONTEXT_SHELF_LIMIT);
  saveContextShelfItems();
  renderContextShelf();
}

async function drainPendingContextShelfItems(): Promise<void> {
  try {
    const sessionArea = chrome.storage.session;
    if (!sessionArea) {
      return;
    }
    const stored = await sessionArea.get(PENDING_CONTEXT_SHELF_ITEMS_KEY);
    const pending = normalizePendingContextShelfItems(stored[PENDING_CONTEXT_SHELF_ITEMS_KEY]);
    if (pending.length === 0) {
      return;
    }

    addContextShelfItems(pending);
    await sessionArea.remove(PENDING_CONTEXT_SHELF_ITEMS_KEY);
    openContextShelfPanel();
    showToast(tr("side.shelfAdded"));
  } catch (error) {
    console.warn("Failed to drain pending Context Shelf items.", error);
  }
}

function renderContextShelf(): void {
  contextShelfList.textContent = "";
  copyShelfButton.disabled = contextShelfItems.length === 0;
  clearShelfButton.disabled = contextShelfItems.length === 0;

  if (contextShelfItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "shelf-empty";
    empty.textContent = uiText("No saved context yet.", "保存済みContextはまだありません");
    contextShelfList.append(empty);
    return;
  }

  const globalActions = document.createElement("div");
  globalActions.className = "composer-secondary-actions";
  globalActions.append(
    shelfActionButton("all", "insert", tr("side.shelfInsert"))
  );
  contextShelfList.append(globalActions);

  for (const item of contextShelfItems) {
    const row = document.createElement("article");
    row.className = "shelf-row";

    const header = document.createElement("div");
    header.className = "shelf-row-header";

    const title = document.createElement("div");
    title.className = "shelf-row-title";
    title.textContent = item.title;

    const meta = document.createElement("div");
    meta.className = "shelf-row-meta";
    meta.textContent = [item.subtitle, formatShelfTime(item.createdAt)].filter(Boolean).join(" · ");

    header.append(title, meta);

    const preview = document.createElement("div");
    preview.className = "shelf-row-preview";
    preview.textContent = item.text;

  const actions = document.createElement("div");
  actions.className = "shelf-row-actions";
  actions.append(
    shelfActionButton(item.id, "insert", uiText("Insert", "挿入")),
    shelfActionButton(item.id, "copy", uiText("Copy", "コピー")),
    shelfActionButton(item.id, "delete", uiText("Delete", "削除"))
  );

    row.append(header, preview, actions);
    contextShelfList.append(row);
  }
}

function shelfActionButton(itemId: string, action: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.shelfAction = action;
  button.dataset.shelfId = itemId;
  button.textContent = label;
  return button;
}

async function handleShelfAction(action: string, itemId: string): Promise<void> {
  const items = itemId === "all" ? contextShelfItems : contextShelfItems.filter((entry) => entry.id === itemId);
  const text = formatShelfText(items);
  if (items.length === 0) {
    return;
  }

  switch (action) {
    case "insert": {
      const result = await insertIntoAI(text);
      closeContextShelfPanel();
      showToast(insertResultMessage(result, uiText("Inserted from Shelf.", "Shelfから挿入しました")));
      setComposerExpanded(false);
      break;
    }
    case "copy": {
      const copied = await copyTextFromSidePanel(text);
      showToast(copied ? tr("side.shelfCopied") : tr("side.copyFailed"));
      break;
    }
    case "delete":
      contextShelfItems = contextShelfItems.filter((entry) => entry.id !== itemId);
      saveContextShelfItems();
      renderContextShelf();
      break;
  }
}

function clearContextShelf(): void {
  if (contextShelfItems.length === 0) {
    return;
  }
  contextShelfItems = [];
  saveContextShelfItems();
  renderContextShelf();
  showToast(tr("side.shelfCleared"));
}

function readContextShelfItems(): ContextShelfItem[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(CONTEXT_SHELF_KEY) || "[]");
    return Array.isArray(value)
      ? value.map(normalizeContextShelfItem).filter((item): item is ContextShelfItem => !!item).slice(0, CONTEXT_SHELF_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function normalizeContextShelfItem(value: unknown): ContextShelfItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as Partial<ContextShelfItem>;
  if (typeof item.text !== "string" || !item.text.trim()) {
    return null;
  }
  return {
    id: typeof item.id === "string" && item.id ? item.id : makeLocalId(),
    title: typeof item.title === "string" && item.title ? item.title : uiText("Saved context", "保存済みContext"),
    subtitle: typeof item.subtitle === "string" ? item.subtitle : "",
    text: item.text,
    createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now()
  };
}

function saveContextShelfItems(): void {
  sessionStorage.setItem(CONTEXT_SHELF_KEY, JSON.stringify(contextShelfItems));
}

function formatShelfText(items: ContextShelfItem[]): string {
  return items
    .map((item, index) => [`#${index + 1} ${item.title}`, item.subtitle, "", item.text].filter((line) => line !== "").join("\n"))
    .join("\n\n---\n\n")
    .trim();
}

function setPromptDraft(text: string): void {
  promptDraftTextarea.value = text;
  savePromptDraft(text);
}

function readPromptDraft(): string {
  try {
    return sessionStorage.getItem(PROMPT_DRAFT_KEY) || "";
  } catch {
    return "";
  }
}

function currentPromptDraftText(): string {
  return promptDraftTextarea.value || readPromptDraft();
}

function savePromptDraft(text: string): void {
  sessionStorage.setItem(PROMPT_DRAFT_KEY, text);
}

function clearPromptDraft(): void {
  if (!promptDraftTextarea.value) {
    return;
  }
  setPromptDraft("");
  promptDraftTextarea.focus();
  showToast(uiText("Draft cleared.", "Draftを空にしました"));
}

async function insertPromptDraft(): Promise<void> {
  const rendered = await renderPromptDraftForService(currentAIService());
  if (!rendered.text) {
    showToast(uiText("Draft is empty.", "Draftが空です"));
    return;
  }
  if (rendered.missingPageText) {
    showToast(uiText("Page body is unavailable on this page.", "このページの本文を取得できませんでした"));
    return;
  }

  const result = await insertIntoAI(rendered.text);
  closePromptDraftPanel();
  showToast(insertResultMessage(result, uiText("Draft inserted.", "Draftを挿入しました")));
  setComposerExpanded(false);
}

async function copyPromptDraft(): Promise<void> {
  const rendered = await renderPromptDraftForService(currentAIService());
  if (!rendered.text) {
    showToast(uiText("Draft is empty.", "Draftが空です"));
    return;
  }
  if (rendered.missingPageText) {
    showToast(uiText("Page body is unavailable on this page.", "このページの本文を取得できませんでした"));
    return;
  }

  const copied = await copyTextFromSidePanel(rendered.text);
  showToast(copied ? tr("common.copied") : tr("side.copyFailed"));
}

async function tryPromptDraftInSelectedService(): Promise<void> {
  if (isDiagnosticBusy()) {
    showToast(uiText("Finish the active diagnostic first.", "診断が終わってから試してください"));
    return;
  }

  const target = serviceOptions().find((option) => option.id === draftTargetSelect.value);
  if (!target) {
    showToast(uiText("Choose a target AI.", "試すAIを選んでください"));
    return;
  }

  savePromptDraftTarget(target.id);
  const rendered = await renderPromptDraftForService(detectAIService(target.url));
  if (!rendered.text) {
    showToast(uiText("Draft is empty.", "Draftが空です"));
    return;
  }
  if (rendered.missingPageText) {
    showToast(uiText("Page body is unavailable on this page.", "このページの本文を取得できませんでした"));
    return;
  }

  if (!isActiveService(target) || !sameFrameSource(currentUrl, target.url)) {
    await selectService(target.id);
    await waitForTargetFrame(target.url, DRAFT_TRY_LOAD_WAIT_MS);
  }

  const result = await insertIntoAI(rendered.text);
  closePromptDraftPanel();
  showToast(insertResultMessage(result, uiText(`Tried in ${target.label}.`, `${target.label}で試しました`)));
  setComposerExpanded(false);
}

async function renderPromptDraftForService(service: AIService): Promise<{ text: string; missingPageText: boolean }> {
  const source = promptDraftTextarea.value.trim();
  if (!source) {
    return { text: "", missingPageText: false };
  }

  const context = await collectPageContext({ includePageText: promptBodyNeedsExtractedPageText(source) });
  const renderContext = { ...context, draft: "" };
  return {
    text: renderPromptTemplate(source, renderContext, service, uiLanguage),
    missingPageText: promptBodyNeedsPageTextValue(source) && !renderContext.pageText?.trim()
  };
}

function renderDraftTargetOptions(): void {
  const options = serviceOptions();
  const preferred = draftTargetSelect.value || readPromptDraftTarget();
  const fallback = options.find((option) => !isActiveService(option)) || options[0];
  const selected = options.find((option) => option.id === preferred) || fallback;

  draftTargetSelect.textContent = "";
  for (const option of options) {
    const choice = document.createElement("option");
    choice.value = option.id;
    choice.textContent = isActiveService(option)
      ? `${option.label} · ${uiText("current", "現在")}`
      : option.label;
    draftTargetSelect.append(choice);
  }

  const hasOptions = options.length > 0;
  draftTargetSelect.disabled = !hasOptions;
  tryDraftButton.disabled = !hasOptions;
  if (selected) {
    draftTargetSelect.value = selected.id;
  }
}

function readPromptDraftTarget(): string {
  try {
    return sessionStorage.getItem(PROMPT_DRAFT_TARGET_KEY) || "";
  } catch {
    return "";
  }
}

function savePromptDraftTarget(value: string): void {
  sessionStorage.setItem(PROMPT_DRAFT_TARGET_KEY, value);
}

function waitForTargetFrame(url: string, timeoutMs: number): Promise<void> {
  if (completedLoadToken === loadToken && sameFrameSource(aiFrame.src, url)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const frame = aiFrame;
    let settled = false;
    let timeout = 0;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      frame.removeEventListener("load", onLoad);
      resolve();
    };
    const onLoad = () => done();
    timeout = window.setTimeout(done, timeoutMs);
    frame.addEventListener("load", onLoad, { once: true });
  });
}

function insertResultMessage(result: { method: "direct" | "clipboard"; message?: string }, directMessage: string): string {
  return result.method === "direct" ? directMessage : result.message || tr("side.noInputCopied");
}

function contextActionLabel(mode: ContextMode, fallback: string): string {
  switch (mode) {
    case "page_text":
      return uiText("Insert page body", "本文を挿入");
    case "summarize_page_with_text":
      return uiText("Summarize with body", "本文つきで要約");
    default:
      return fallback;
  }
}

function renderSidePanelContextTemplate(context: PageContext, mode: ContextMode, language: ResolvedLanguage): string {
  if (mode === "page_text" || mode === "summarize_page_with_text") {
    return renderPageBodyContextTemplate(context, mode);
  }

  return renderContextTemplate(context, mode, language);
}

function renderPageBodyContextTemplate(context: PageContext, mode: Extract<ContextMode, "page_text" | "summarize_page_with_text">): string {
  const title = context.title.trim();
  const url = context.url.trim();
  const domain = (context.domain || domainFromContextUrl(url)).trim();
  const headings = Array.isArray(context.headings) ? context.headings.map((heading) => heading.trim()).filter(Boolean) : [];
  const pageText = (context.pageText || "").trim();
  const lines = mode === "summarize_page_with_text"
    ? [uiText("Please summarize this page using the body text.", "次のページ本文を使って要約してください"), ""]
    : [];

  lines.push(
    uiText("Title:", "タイトル:"),
    title,
    "",
    uiText("URL:", "URL:"),
    url
  );

  if (domain) {
    lines.push("", uiText("Domain:", "ドメイン:"), domain);
  }
  if (headings.length > 0) {
    lines.push("", uiText("Headings:", "見出し:"), headings.join("\n"));
  }
  if (pageText) {
    lines.push("", uiText("Page body:", "本文:"), pageText);
  }
  if (context.pageTextTruncated) {
    lines.push("", uiText("Page body was truncated.", "本文は途中まで取得されています"));
  }

  return compactLines(lines);
}

function contextModeUsesPageText(mode: ContextMode): boolean {
  return mode === "page_text" || mode === "summarize_page_with_text";
}

function promptBodyNeedsExtractedPageText(body: string): boolean {
  return /\{\{(?:pageText|headings|domain)\}\}/.test(body);
}

function promptBodyNeedsPageTextValue(body: string): boolean {
  return /\{\{pageText\}\}/.test(body);
}

function contextShelfSubtitle(context: PageContext): string {
  const parts = [
    context.domain || domainFromContextUrl(context.url),
    context.selection.trim() ? uiText("Selection included", "選択範囲あり") : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

function formatShelfTime(value: number): string {
  try {
    return new Date(value).toLocaleString(uiLanguage === "ja" ? "ja-JP" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function normalizePageTextSource(source: unknown): PageContext["pageTextSource"] | undefined {
  return source === "article" || source === "main" || source === "body" || source === "document" || source === "fallback" ? source : undefined;
}

function domainFromContextUrl(url: string | undefined): string {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function compactLines(lines: string[]): string {
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function makeLocalId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function uiText(en: string, ja: string): string {
  return uiLanguage === "ja" ? ja : en;
}

function showToast(message: string): void {
  if (toastTimer !== undefined) {
    window.clearTimeout(toastTimer);
  }
  if (toastExitTimer !== undefined) {
    window.clearTimeout(toastExitTimer);
  }

  composerToast.textContent = message;
  composerToast.hidden = false;
  composerToast.dataset.state = "entering";
  toastTimer = window.setTimeout(() => {
    composerToast.dataset.state = "exiting";
    toastExitTimer = window.setTimeout(() => {
      composerToast.hidden = true;
      delete composerToast.dataset.state;
      toastTimer = undefined;
      toastExitTimer = undefined;
    }, TOAST_EXIT_MS);
  }, TOAST_MS - TOAST_EXIT_MS);
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
    setStatus(uiLanguage === "ja" ? "診断中はサービスを切り替えられません。" : "Finish the active diagnostic before switching services.", "diagnostic");
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
  setStatus(tr("side.orderSaved"));
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
    setStatus(tr("side.keepOneHeader"));
    return;
  }

  destroyPreservedFrame(serviceId);
  if (settings.defaultPresetId === serviceId || settings.activePresetId === serviceId) {
    const fallback = visibleOptions[0];
    if (fallback) {
      settings.defaultPresetId = fallback.id;
      await loadTarget(fallback.id, fallback.label, fallback.url, { forceSave: true });
      setStatus(tr("side.serviceShown", { label: fallback.label }));
      return;
    }
  }

  settings = await saveSettings(settings);
  renderServiceSwitcher();
  setStatus(tr("side.serviceHidden"));
}

function openServiceMenu(serviceId: string): void {
  const option = serviceOptions({ includeHidden: true }).find((item) => item.id === serviceId);
  if (!option) {
    return;
  }

  menuServiceId = option.id;
  hideServiceButton.textContent = uiLanguage === "ja" ? `${option.label}を非表示` : `Hide ${option.label}`;
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
  const { frame, reused } = activateFrameForLoad(options.activePresetId, token, url, {
    forceReload: options.forceReload || !!options.diagnostic,
    transient: !!options.diagnostic
  });
  const shouldReplaceFrameCompatibilitySession =
    !!activeFrameCompatibilitySessionId || shouldStartFrameCompatibilitySession(options.activePresetId, url, options);
  const frameCompatibilitySessionId = shouldReplaceFrameCompatibilitySession
    ? await replaceFrameCompatibilitySession(options.activePresetId, url, options)
    : undefined;

  if (reused) {
    clearLoadTimers();
    completedLoadToken = token;
    timedOutLoadToken = undefined;
    setLoading(false);
    setStatus(uiLanguage === "ja" ? `${label || "Service"}を復元しました。` : `${label || "Service"} restored.`, options.diagnostic ? "diagnostic" : "success");
    return { token, frameCompatibilitySessionId };
  }

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
      updateActiveDiagnostic("timeout", uiLanguage === "ja" ? "フレームの読み込みが時間内に完了しませんでした。" : "Timed out waiting for the frame to load.");
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
  setStatus(tr("side.chooseService"), "idle");
  clearPreservedFrames();
  await endActiveFrameCompatibilitySession();
  if (settings.activePresetId !== settings.defaultPresetId) {
    settings.activePresetId = settings.defaultPresetId;
    await saveSettings(settings);
  }
}

function activateFrameForLoad(
  presetId: ActivePresetId,
  token: number,
  expectedUrl: string,
  options: { forceReload: boolean; transient: boolean }
): { frame: HTMLIFrameElement; reused: boolean } {
  if (options.transient) {
    const frame = createFrameForLoad(token, expectedUrl);
    destroyDiagnosticFrame();
    diagnosticFrame = frame;
    showFrame(frame);
    return { frame, reused: false };
  }

  const existing = preservedFrames.get(presetId);
  if (existing && !options.forceReload && existing.loaded && sameFrameSource(existing.sourceUrl, expectedUrl)) {
    destroyDiagnosticFrame();
    showFrame(existing.frame);
    return { frame: existing.frame, reused: true };
  }

  if (existing) {
    destroyPreservedFrame(presetId);
  }

  const frame = createFrameForLoad(token, expectedUrl);
  preservedFrames.set(presetId, { frame, sourceUrl: expectedUrl, loaded: false });
  destroyDiagnosticFrame();
  showFrame(frame);
  return { frame, reused: false };
}

function createFrameForLoad(token: number, expectedUrl: string): HTMLIFrameElement {
  const nextFrame = reusableInitialFrame() ?? document.createElement("iframe");
  configureAIFrame(nextFrame, "");
  nextFrame.src = "about:blank";
  nextFrame.hidden = true;
  nextFrame.addEventListener("load", () => {
    completeLoad(token, expectedUrl, nextFrame);
  });
  nextFrame.addEventListener("error", () => {
    void handleFrameError(token);
  });
  if (nextFrame.parentElement !== frameDeck) {
    frameDeck.append(nextFrame);
  }
  return nextFrame;
}

function configureAIFrame(frame: HTMLIFrameElement, id: string): void {
  frame.id = id;
  frame.title = "AI service";
  frame.tabIndex = 0;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.setAttribute("allow", AI_FRAME_ALLOW);
}

function reusableInitialFrame(): HTMLIFrameElement | undefined {
  if (preservedFrames.size > 0 || diagnosticFrame || aiFrame.parentElement !== frameDeck) {
    return undefined;
  }

  if ([...preservedFrames.values()].some((record) => record.frame === aiFrame) || diagnosticFrame === aiFrame) {
    return undefined;
  }

  return aiFrame;
}

function sameFrameSource(left: string, right: string): boolean {
  return canonicalUrl(left) === canonicalUrl(right);
}

function showFrame(frame: HTMLIFrameElement): void {
  for (const record of preservedFrames.values()) {
    const active = record.frame === frame;
    record.frame.hidden = !active;
    record.frame.id = active ? "aiFrame" : "";
  }

  if (diagnosticFrame) {
    const active = diagnosticFrame === frame;
    diagnosticFrame.hidden = !active;
    diagnosticFrame.id = active ? "aiFrame" : "";
  }

  frame.hidden = false;
  frame.id = "aiFrame";
  aiFrame = frame;
}

function markFrameLoaded(frame: HTMLIFrameElement): void {
  for (const record of preservedFrames.values()) {
    if (record.frame === frame) {
      record.loaded = true;
      return;
    }
  }
}

function destroyPreservedFrame(presetId: ActivePresetId): void {
  const record = preservedFrames.get(presetId);
  if (!record) {
    return;
  }

  preservedFrames.delete(presetId);
  record.frame.remove();
}

function destroyDiagnosticFrame(): void {
  if (!diagnosticFrame) {
    return;
  }

  diagnosticFrame.remove();
  diagnosticFrame = null;
}

function clearPreservedFrames(): void {
  for (const record of preservedFrames.values()) {
    record.frame.remove();
  }
  preservedFrames.clear();
  destroyDiagnosticFrame();
  aiFrame.remove();

  const blankFrame = document.createElement("iframe");
  configureAIFrame(blankFrame, "aiFrame");
  blankFrame.src = "about:blank";
  frameDeck.append(blankFrame);
  aiFrame = blankFrame;
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
    updateActiveDiagnostic("manual-fail", uiLanguage === "ja" ? "フレームの読み込みに失敗しました。" : "Frame failed to load.");
    return;
  }
  setStatus(tr("side.loadFailed", { label: currentLabel || "Service" }), "warning");
}

function completeLoad(token: number, expectedUrl: string, frame: HTMLIFrameElement): void {
  if (frame.src !== "about:blank" && canonicalUrl(frame.src) === canonicalUrl(expectedUrl)) {
    markFrameLoaded(frame);
  }

  if (token !== loadToken || completedLoadToken === token || expectedUrl !== currentUrl || frame !== aiFrame || frame.src === "about:blank") {
    return;
  }

  if (canonicalUrl(frame.src) !== canonicalUrl(expectedUrl)) {
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
    setStatus(uiLanguage === "ja" ? "診断用フレームがload eventを返しました。表示結果を手動で記録してください。" : "Diagnostic frame load event fired. Cross-origin frames cannot be inspected; mark the visual result.", "diagnostic");
    return;
  }
  setStatus(uiLanguage === "ja" ? `${currentLabel || "Service"}を読み込みました。` : `${currentLabel || "Service"} ${loadedAfterTimeout ? "loaded after waiting" : "loaded"}.`, "success");
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
    setStatus(uiLanguage === "ja" ? "診断中は再読み込みできません。" : "Finish the active diagnostic before reloading.", "diagnostic");
    return;
  }

  if (!currentUrl) {
    setStatus(uiLanguage === "ja" ? "URLが選択されていません。" : "No URL is selected.", "warning");
    return;
  }
  await loadUrl(currentLabel || "AI service", currentUrl, { activePresetId: settings.activePresetId, forceReload: true });
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
    response.ok ? tr("side.fallbackOpened") : response.error || tr("side.fallbackOpenFailed"),
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
  prunePreservedFrames();
  localizeStaticUi();
  syncSidePanelChromeUi();
  renderServiceSwitcher();
  if (!promptPalette.hidden) {
    renderPromptList();
  }
  if (!contextPopover.hidden && lastContext) {
    renderContextActions(lastContext);
  }
  renderContextShelf();
  renderDraftTargetOptions();
  renderDiagnostics();
}

function prunePreservedFrames(): void {
  const availableIds = new Set(serviceOptions({ includeHidden: true }).map((option) => option.id));
  for (const presetId of preservedFrames.keys()) {
    if (!availableIds.has(presetId)) {
      destroyPreservedFrame(presetId);
    }
  }
}

function resolveUiLanguage(): ResolvedLanguage {
  return resolveLanguage(settings.language, globalThis.navigator?.language || "");
}

function tr(key: string, params?: Parameters<typeof t>[2]): string {
  return t(uiLanguage, key as Parameters<typeof t>[1], params);
}

function localizeStaticUi(): void {
  if (document.documentElement) {
    document.documentElement.lang = uiLanguage;
  }
  hideServiceButton.textContent = tr("side.hideFromHeader");
  contextPopover.setAttribute("aria-label", tr("side.contextActions"));
  contextSummary.textContent = lastContext ? contextSummary.textContent : tr("side.noSelection");
  promptPalette.setAttribute("aria-label", tr("side.promptPalette"));
  promptSearchInput.placeholder = tr("side.promptSearch");
  promptList.setAttribute("aria-label", tr("side.promptTemplates"));
  fallbackOpenWindowButton.textContent = tr("side.openSideWindow");
  fallbackOpenTabButton.textContent = tr("side.openTab");
  fallbackReloadButton.textContent = tr("side.tryAgain");
  fallbackTitleSuffix.textContent = uiLanguage === "ja" ? tr("side.fallbackSuffix") : ` ${tr("side.fallbackSuffix")}`;
  fallbackReason.textContent = fallbackPanel.hidden ? fallbackReason.textContent : defaultFallbackReason();
  fallbackNote.textContent = tr("side.fallbackNote");
  setupOptionsButton.textContent = tr("common.openOptions");
  const setupTitle = typeof setupPanel.querySelector === "function" ? setupPanel.querySelector("h2") : null;
  const setupCopy = typeof setupPanel.querySelector === "function" ? setupPanel.querySelector("p") : null;
  if (setupTitle) setupTitle.textContent = tr("side.setupTitle");
  if (setupCopy) setupCopy.textContent = tr("side.setupCopy");
  composerToolbar.setAttribute("aria-label", tr("side.composerTools"));
  composerLauncherButton.title = tr("side.composerTools");
  composerLauncherButton.setAttribute("aria-label", tr("side.openComposerTools"));
  contextButton.title = tr("side.addPageContext");
  const contextLabel = typeof contextButton.querySelector === "function" ? contextButton.querySelector(".composer-button-label") : null;
  if (contextLabel) contextLabel.textContent = tr("side.context");
  promptButton.title = tr("side.openPromptPalette");
  const promptLabel = typeof promptButton.querySelector === "function" ? promptButton.querySelector(".composer-button-label") : null;
  if (promptLabel) promptLabel.textContent = tr("side.prompt");
  shelfButton.title = uiText("Open Context Shelf", "Context Shelfを開く");
  shelfButton.setAttribute("aria-label", shelfButton.title);
  const shelfLabel = typeof shelfButton.querySelector === "function" ? shelfButton.querySelector(".composer-button-label") : null;
  if (shelfLabel) shelfLabel.textContent = uiText("Shelf", "Shelf");
  addContextToShelfButton.textContent = uiText("Add to Shelf", "Shelfに追加");
  contextShelfPanel.setAttribute("aria-label", "Context Shelf");
  contextShelfTitle.textContent = "Context Shelf";
  copyShelfButton.textContent = tr("side.shelfCopyAll");
  clearShelfButton.textContent = uiText("Clear all", "すべて削除");
  promptDraftPanel.setAttribute("aria-label", "Prompt Draft");
  promptDraftTitle.textContent = "Prompt Draft";
  promptDraftTextarea.placeholder = uiText("Draft a prompt...", "Promptを下書き...");
  draftTargetSelect.setAttribute("aria-label", uiText("Try in another AI", "別のAIで試す"));
  tryDraftButton.textContent = uiText("Try", "試す");
  insertDraftButton.textContent = uiText("Insert", "挿入");
  copyDraftButton.textContent = uiText("Copy", "コピー");
  clearDraftButton.textContent = uiText("Clear", "クリア");
  moreActionsButton.title = tr("common.openSettings");
  moreActionsButton.setAttribute("aria-label", tr("common.openSettings"));
}

function syncSidePanelChromeUi(): void {
  const headerCollapsed = settings.sidePanelChrome.headerCollapsed;
  const footerCollapsed = settings.sidePanelChrome.footerCollapsed;

  app.dataset.headerCollapsed = headerCollapsed ? "true" : "false";
  app.dataset.footerCollapsed = footerCollapsed ? "true" : "false";
  serviceSwitcher.setAttribute("aria-hidden", headerCollapsed ? "true" : "false");
  serviceMenu.setAttribute("aria-hidden", headerCollapsed ? "true" : "false");
  headerReloadButton.title = tr("common.reload");
  headerReloadButton.setAttribute("aria-label", tr("common.reload"));
  headerReloadButton.setAttribute("aria-hidden", headerCollapsed ? "true" : "false");
  composerActions.setAttribute("aria-hidden", footerCollapsed ? "true" : "false");
  moreActionsButton.setAttribute("aria-hidden", footerCollapsed ? "true" : "false");

  const headerLabel = headerCollapsed ? tr("common.expandHeader") : tr("common.collapseHeader");
  headerChromeToggleButton.title = headerLabel;
  headerChromeToggleButton.setAttribute("aria-label", headerLabel);
  headerChromeToggleButton.setAttribute("aria-expanded", headerCollapsed ? "false" : "true");

  const footerLabel = footerCollapsed ? tr("common.expandFooter") : tr("common.collapseFooter");
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
    button.title = option.url ? `${option.label}: ${option.url}. ${tr("side.dragHideHint")}` : option.label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-label", tr("side.openService", { label: option.label }));
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
    return tr("side.loadingDiagnostic", { label, mode: modeLabel(options.diagnostic.dnrEnabled) });
  }

  return tr("side.loadingService", { label });
}

function loadNoticeMessage(label: string, options: LoadOptions): string {
  if (options.diagnostic) {
    return tr("side.loadNoticeDiagnostic", { label });
  }

  return tr("side.loadNotice", { label });
}

function timeoutStatusMessage(label: string, options: LoadOptions): string {
  if (options.diagnostic) {
    return tr("side.timeoutDiagnostic", { label });
  }

  return tr("side.timeout", { label });
}

function timeoutFallbackReason(options: LoadOptions): string {
  if (options.diagnostic) {
    return tr("side.timeoutDiagnosticReason");
  }

  return tr("side.timeoutReason");
}

function defaultFallbackReason(): string {
  return tr("side.fallbackReason");
}

function modeLabel(enabled: boolean): string {
  return enabled ? tr("side.compatOn") : tr("side.compatOff");
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
