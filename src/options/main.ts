import { BUILT_IN_PRESETS, CUSTOM_PRESET_ID, DEFAULT_PRESET_ID, makeCustomPresetId } from "../shared/presets.js";
import { defaultSettings, getSettings, normalizeSettings, saveSettings, SETTINGS_KEY } from "../shared/storage.js";
import {
  CUSTOM_PROMPT_TEMPLATES_KEY,
  addCustomPromptTemplate,
  deleteCustomPromptTemplate,
  getCustomPromptTemplates,
  normalizeCustomPromptTemplates,
  updateCustomPromptTemplatePatch
} from "../storage/promptTemplateStorage.js";
import type { PromptTemplate } from "../features/composer/types.js";
import type { ActivePresetId, CustomUrl, PresetId, Settings } from "../shared/types.js";
import { resolveLanguage, t, type ResolvedLanguage } from "../shared/i18n.js";
import { labelFromUrl, normalizeUserUrl } from "../shared/url.js";
import { UNCATEGORIZED_CATEGORY_KEY } from "../shared/contextShelfSession.js";

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

const hiddenServiceList = element<HTMLElement>("hiddenServiceList");
const customUrlForm = element<HTMLFormElement>("customUrlForm");
const customLabelInput = element<HTMLInputElement>("customLabelInput");
const customUrlInput = element<HTMLInputElement>("customUrlInput");
const customUrlList = element<HTMLElement>("customUrlList");
const promptTemplateForm = element<HTMLFormElement>("promptTemplateForm");
const promptTitleInput = element<HTMLInputElement>("promptTitleInput");
const promptCategoryInput = element<HTMLInputElement>("promptCategoryInput");
const promptCategoryCombobox = element<HTMLElement>("promptCategoryCombobox");
const promptBodyInput = element<HTMLTextAreaElement>("promptBodyInput");
const promptSubmitButton = element<HTMLButtonElement>("promptSubmitButton");
const promptTemplateList = element<HTMLElement>("promptTemplateList");
const resetSettingsButton = element<HTMLButtonElement>("resetSettingsButton");
const languageSelect = element<HTMLSelectElement>("languageSelect");
const statusText = element<HTMLElement>("statusText");
const aboutVersion = element<HTMLElement>("aboutVersion");
const STATUS_RESET_MS = 2000;
const ENTRY_STATUS_SHOW_MS = 1600;
const FAVICON_FETCH_TIMEOUT_MS = 2500;
const FAVICON_IMAGE_TIMEOUT_MS = 1500;
const FAVICON_HTML_MAX_BYTES = 1_000_000;
const FAVICON_MANIFEST_MAX_BYTES = 200_000;
const FAVICON_MANIFEST_ICON_LIMIT = 50;

let settings: Settings;
let uiLanguage: ResolvedLanguage = "en";
let customPromptTemplates: PromptTemplate[] = [];
let statusTimer: number | undefined;
const promptTemplateOperations = new Map<string, Promise<void>>();
const deletedPromptTemplateIds = new Set<string>();
const collapsedPromptTemplateCategories = new Set<string>();

void init();

async function init(): Promise<void> {
  settings = await getSettings();
  uiLanguage = resolveUiLanguage();
  customPromptTemplates = await getCustomPromptTemplates();
  await migrateBareCustomDefault();
  renderVersion();
  localizeStaticUi();
  attachCategoryCombobox(promptCategoryCombobox, promptCategoryInput, promptTemplateCategories);
  render();
  bindEvents();
  observeSections();
}

function bindEvents(): void {
  hiddenServiceList.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.quickAccessId) {
      return;
    }
    void setQuickAccessVisible(target.dataset.quickAccessId as ActivePresetId, target.checked);
  });

  customUrlForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void addCustomUrl();
  });

  promptTemplateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void addPromptTemplate();
  });

  customUrlList.addEventListener("focusout", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const entry = target.closest<HTMLElement>(".entry");
    const customUrlId = entry?.dataset.entryId;
    if (!entry || !customUrlId) {
      return;
    }
    void handleCustomUrlBlur(customUrlId, target, entry);
  });

  customUrlList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      event.preventDefault();
      target.blur();
    }
  });

  customUrlList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-delete-id]");
    if (button?.dataset.deleteId) {
      void deleteCustomUrl(button.dataset.deleteId);
    }
  });

  promptTemplateList.addEventListener("focusout", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return;
    }
    const entry = target.closest<HTMLElement>(".entry");
    const templateId = entry?.dataset.entryId;
    if (!entry || !templateId) {
      return;
    }
    void handlePromptTemplateBlur(templateId, target, entry);
  });

  promptTemplateList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      event.preventDefault();
      target.blur();
    }
  });

  promptTemplateList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const categoryToggle = target.closest<HTMLButtonElement>("button[data-prompt-category]");
    if (categoryToggle?.dataset.promptCategory) {
      togglePromptTemplateCategory(categoryToggle.dataset.promptCategory);
      return;
    }

    const button = target.closest<HTMLButtonElement>("button[data-delete-prompt-id]");
    if (button?.dataset.deletePromptId) {
      void removePromptTemplate(button.dataset.deletePromptId);
    }
  });

  resetSettingsButton.addEventListener("click", () => {
    void resetSettings();
  });

  languageSelect.addEventListener("change", () => {
    void setLanguage(languageSelect.value);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[CUSTOM_PROMPT_TEMPLATES_KEY]) {
      customPromptTemplates = normalizeCustomPromptTemplates(changes[CUSTOM_PROMPT_TEMPLATES_KEY].newValue);
      renderPromptTemplates();
    }

    if (changes[SETTINGS_KEY]?.newValue) {
      settings = normalizeSettings(changes[SETTINGS_KEY].newValue);
      uiLanguage = resolveUiLanguage();
      localizeStaticUi();
      render();
    }
  });
}

function observeSections(): void {
  if (typeof document.querySelectorAll !== "function" || typeof IntersectionObserver === "undefined") {
    return;
  }

  const navItems = Array.from(document.querySelectorAll<HTMLAnchorElement>(".nav-item[data-target]"));
  const sectionMap = new Map<string, HTMLAnchorElement>();
  for (const item of navItems) {
    const target = item.dataset.target;
    if (target) {
      sectionMap.set(target, item);
    }
  }

  const sections = Array.from(sectionMap.keys()).map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
  if (sections.length === 0) {
    return;
  }

  const visible = new Map<string, number>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        visible.set(entry.target.id, entry.intersectionRatio);
      }
      let bestId = "";
      let bestRatio = 0;
      for (const [id, ratio] of visible) {
        if (ratio > bestRatio) {
          bestId = id;
          bestRatio = ratio;
        }
      }
      for (const [id, item] of sectionMap) {
        item.classList.toggle("is-active", id === bestId);
      }
    },
    { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
  );

  for (const section of sections) {
    observer.observe(section);
  }
}

function render(): void {
  languageSelect.value = settings.language;
  renderQuickAccessServices();
  renderCustomUrls();
  renderPromptTemplates();
}

function renderVersion(): void {
  const manifest = chrome.runtime.getManifest?.();
  if (manifest?.version) {
    aboutVersion.textContent = manifest.version;
  }
}

function resolveUiLanguage(): ResolvedLanguage {
  return resolveLanguage(settings.language, globalThis.navigator?.language || "");
}

function localizeStaticUi(): void {
  if (document.documentElement) {
    document.documentElement.lang = uiLanguage;
  }
  document.title = tr("options.title");
  updateCategoryComboboxLabels();
  if (typeof document.querySelectorAll !== "function") {
    return;
  }

  for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    node.textContent = tr(node.dataset.i18n || "options.title");
  }

  for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n-attr]"))) {
    const pairs = (node.dataset.i18nAttr || "").split(",");
    for (const pair of pairs) {
      const [attr, key] = pair.split(":").map((part) => part.trim());
      if (attr && key) {
        node.setAttribute(attr, tr(key));
      }
    }
  }
}

function updateCategoryComboboxLabels(): void {
  if (typeof document.querySelectorAll !== "function") {
    return;
  }

  for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-category-combobox-chevron]"))) {
    node.setAttribute("aria-label", tr("options.openCategoryList"));
  }
}

function tr(key: string, params?: Parameters<typeof t>[2]): string {
  return t(uiLanguage, key as Parameters<typeof t>[1], params);
}

function confirmAction(message: string): boolean {
  return typeof confirm === "function" ? confirm(message) : true;
}

function renderQuickAccessServices(): void {
  hiddenServiceList.textContent = "";

  const title = document.createElement("p");
  title.className = "hint";
  title.textContent = tr("options.quickAccess");
  hiddenServiceList.append(title);

  const list = document.createElement("div");
  list.className = "quick-access-list";
  const visibleCount = visibleQuickAccessCount();
  for (const service of quickAccessOptions()) {
    const visible = isQuickAccessVisible(service.id);
    const row = document.createElement("label");
    row.className = "quick-access-row";

    const icon = createEntryIcon(service.iconUrl, serviceInitial(service.label));
    row.append(icon);

    const copy = document.createElement("span");
    copy.className = "quick-access-copy";
    const name = document.createElement("strong");
    name.textContent = service.label;
    const url = document.createElement("span");
    url.textContent = service.url;
    copy.append(name, url);
    row.append(copy);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = visible;
    checkbox.dataset.quickAccessId = service.id;
    checkbox.setAttribute("aria-label", tr(visible ? "options.hideServiceAria" : "options.showServiceAria", { label: service.label }));
    if (visible && visibleCount <= 1) {
      checkbox.disabled = true;
      checkbox.title = tr("options.keepOneQuickAccess");
    }
    row.append(checkbox);
    list.append(row);
  }
  hiddenServiceList.append(list);
}

function renderCustomUrls(): void {
  customUrlList.textContent = "";

  if (settings.customUrls.length === 0) {
    customUrlList.append(emptyState(tr("options.noCustomUrlsTitle"), tr("options.noCustomUrlsCopy")));
    return;
  }

  for (const customUrl of settings.customUrls) {
    customUrlList.append(customUrlEntry(customUrl));
  }
}

function renderPromptTemplates(): void {
  promptTemplateList.textContent = "";

  if (customPromptTemplates.length === 0) {
    promptTemplateList.append(emptyState(tr("options.noPromptsTitle"), tr("options.noPromptsCopy")));
    return;
  }

  for (const group of groupPromptTemplatesByCategory(customPromptTemplates)) {
    promptTemplateList.append(promptTemplateGroup(group.key, group.label, group.templates));
  }
}

function promptTemplateCategories(): string[] {
  return [...new Set(customPromptTemplates.map((template) => template.category.trim()).filter(Boolean))];
}

const SVG_NS = "http://www.w3.org/2000/svg";
let categoryComboboxId = 0;

function attachCategoryCombobox(
  wrapper: HTMLElement,
  input: HTMLInputElement,
  getOptions: () => string[]
): void {
  const idBase = wrapper.id || `category-combobox-${++categoryComboboxId}`;
  if (!wrapper.id) {
    wrapper.id = idBase;
  }

  const chevron = document.createElement("button");
  chevron.className = "category-combobox-chevron";
  chevron.type = "button";
  chevron.tabIndex = -1;
  chevron.dataset.categoryComboboxChevron = "true";
  chevron.setAttribute("aria-label", tr("options.openCategoryList"));
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "m6 9 6 6 6-6");
  svg.append(path);
  chevron.append(svg);

  const panel = document.createElement("div");
  panel.className = "category-combobox-panel";
  panel.id = `${idBase}-panel`;
  panel.hidden = true;
  panel.setAttribute("role", "listbox");

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", panel.id);

  wrapper.append(chevron, panel);

  let open = false;
  let activeIndex = -1;
  let optionButtons: HTMLButtonElement[] = [];
  let blurTimer: ReturnType<typeof setTimeout> | undefined;

  function renderOptions(): void {
    panel.textContent = "";
    optionButtons = [];
    const allCategories = getOptions();
    const query = input.value.trim().toLowerCase();
    const filtered = query
      ? allCategories.filter((category) => category.toLowerCase().includes(query))
      : allCategories;

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "category-combobox-empty";
      empty.textContent = tr("options.noCategoryMatches");
      panel.append(empty);
      return;
    }

    filtered.forEach((category, index) => {
      const button = document.createElement("button");
      button.className = "category-combobox-option";
      button.id = `${idBase}-option-${index}`;
      button.type = "button";
      button.tabIndex = -1;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");
      button.textContent = category;
      button.dataset.index = String(index);
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        input.value = category;
        closePanel();
        input.focus();
      });
      panel.append(button);
      optionButtons.push(button);
    });
  }

  function syncActive(): void {
    optionButtons.forEach((button, index) => {
      if (index === activeIndex) {
        button.dataset.active = "true";
        button.setAttribute("aria-selected", "true");
        input.setAttribute("aria-activedescendant", button.id);
      } else {
        delete button.dataset.active;
        button.setAttribute("aria-selected", "false");
      }
    });
    if (activeIndex < 0) {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function openPanel(): void {
    if (open) {
      return;
    }
    open = true;
    wrapper.dataset.open = "true";
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
    renderOptions();
    syncActive();
  }

  function closePanel(): void {
    if (!open) {
      return;
    }
    open = false;
    activeIndex = -1;
    delete wrapper.dataset.open;
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  input.addEventListener("focus", () => {
    if (blurTimer !== undefined) {
      clearTimeout(blurTimer);
      blurTimer = undefined;
    }
    openPanel();
  });

  input.addEventListener("input", () => {
    activeIndex = -1;
    if (open) {
      renderOptions();
      syncActive();
    } else {
      openPanel();
    }
  });

  input.addEventListener("blur", () => {
    blurTimer = setTimeout(() => {
      closePanel();
      blurTimer = undefined;
    }, 120);
  });

  input.addEventListener("keydown", (event) => {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.key === "Escape" && open) {
      keyEvent.stopPropagation();
      closePanel();
      return;
    }
    if (!open) {
      if (keyEvent.key === "ArrowDown") {
        keyEvent.preventDefault();
        openPanel();
      }
      return;
    }
    if (keyEvent.key === "ArrowDown") {
      keyEvent.preventDefault();
      if (optionButtons.length === 0) {
        return;
      }
      activeIndex = activeIndex < optionButtons.length - 1 ? activeIndex + 1 : 0;
      syncActive();
    } else if (keyEvent.key === "ArrowUp") {
      keyEvent.preventDefault();
      if (optionButtons.length === 0) {
        return;
      }
      activeIndex = activeIndex > 0 ? activeIndex - 1 : optionButtons.length - 1;
      syncActive();
    } else if (keyEvent.key === "Enter" && activeIndex >= 0 && optionButtons[activeIndex]) {
      keyEvent.preventDefault();
      optionButtons[activeIndex].click();
    }
  });

  chevron.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  chevron.addEventListener("click", () => {
    if (open) {
      closePanel();
    } else {
      input.focus();
      openPanel();
    }
  });
}

function promptCategoryKey(template: PromptTemplate): string {
  return template.category.trim() || UNCATEGORIZED_CATEGORY_KEY;
}

function promptCategoryLabel(categoryKey: string): string {
  return categoryKey === UNCATEGORIZED_CATEGORY_KEY ? tr("options.promptCategoryPlaceholder") : categoryKey;
}

function isPromptTemplateCategoryExpanded(categoryKey: string): boolean {
  return !collapsedPromptTemplateCategories.has(categoryKey);
}

function groupPromptTemplatesByCategory(templates: PromptTemplate[]): { key: string; label: string; templates: PromptTemplate[] }[] {
  const groups = new Map<string, PromptTemplate[]>();
  for (const template of templates) {
    const key = promptCategoryKey(template);
    const existing = groups.get(key) ?? [];
    existing.push(template);
    groups.set(key, existing);
  }
  return [...groups.entries()].map(([key, groupedTemplates]) => ({
    key,
    label: promptCategoryLabel(key),
    templates: groupedTemplates
  }));
}

function promptTemplateGroup(categoryKey: string, label: string, templates: PromptTemplate[]): HTMLElement {
  const group = document.createElement("section");
  group.className = "prompt-category-group";
  group.dataset.promptCategoryGroup = categoryKey;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "prompt-category-toggle";
  toggle.dataset.promptCategory = categoryKey;
  const expanded = isPromptTemplateCategoryExpanded(categoryKey);
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");

  const chevron = document.createElement("span");
  chevron.className = "prompt-category-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.append(svgIcon("M9 6l6 6-6 6"));

  const title = document.createElement("span");
  title.className = "prompt-category-title";
  title.textContent = label;

  const count = document.createElement("span");
  count.className = "prompt-category-count";
  count.textContent = tr("options.promptCategoryCount", { count: templates.length });
  toggle.append(chevron, title, count);

  const items = document.createElement("div");
  items.className = "prompt-category-items";
  items.hidden = !expanded;
  for (const template of templates) {
    items.append(promptTemplateEntry(template));
  }

  group.append(toggle, items);
  return group;
}

function togglePromptTemplateCategory(categoryKey: string): void {
  if (collapsedPromptTemplateCategories.has(categoryKey)) {
    collapsedPromptTemplateCategories.delete(categoryKey);
  } else {
    collapsedPromptTemplateCategories.add(categoryKey);
  }
  renderPromptTemplates();
}

function customUrlEntry(customUrl: CustomUrl): HTMLElement {
  const entry = document.createElement("div");
  entry.className = "entry";
  entry.dataset.entryId = customUrl.id;

  const head = document.createElement("div");
  head.className = "entry-head";

  head.append(createEntryIcon(customUrl.iconUrl, serviceInitial(customUrl.label)));

  const fields = document.createElement("div");
  fields.className = "entry-fields";

  const labelInput = document.createElement("input");
  labelInput.className = "entry-input";
  labelInput.type = "text";
  labelInput.name = "label";
  labelInput.value = customUrl.label;
  labelInput.placeholder = tr("options.workspaceName");
  labelInput.spellcheck = false;
  labelInput.setAttribute("aria-label", tr("options.workspaceName"));

  const urlInput = document.createElement("input");
  urlInput.className = "entry-input is-secondary";
  urlInput.type = "text";
  urlInput.name = "url";
  urlInput.inputMode = "url";
  urlInput.value = customUrl.url;
  urlInput.placeholder = "https://example.com/";
  urlInput.spellcheck = false;
  urlInput.setAttribute("autocomplete", "url");
  urlInput.setAttribute("aria-label", tr("options.workspaceUrl"));

  fields.append(labelInput, urlInput);
  head.append(fields, entryActions(customUrl.id, "deleteId", tr("options.removeUrl")));
  entry.append(head);

  const foot = document.createElement("div");
  foot.className = "entry-foot";
  const status = document.createElement("span");
  status.className = "entry-status";
  status.dataset.role = "status";
  foot.append(status);
  entry.append(foot);

  return entry;
}

function promptTemplateEntry(template: PromptTemplate): HTMLElement {
  const entry = document.createElement("div");
  entry.className = "entry prompt-template-entry";
  entry.dataset.entryId = template.id;

  const head = document.createElement("div");
  head.className = "entry-head";

  const fields = document.createElement("div");
  fields.className = "entry-fields";

  const titleInput = document.createElement("input");
  titleInput.className = "entry-input";
  titleInput.type = "text";
  titleInput.name = "title";
  titleInput.value = template.title;
  titleInput.placeholder = tr("options.promptTitleInput");
  titleInput.setAttribute("aria-label", tr("options.promptTitleInput"));

  const categoryInput = document.createElement("input");
  categoryInput.className = "entry-input is-secondary";
  categoryInput.type = "text";
  categoryInput.name = "category";
  categoryInput.value = template.category;
  categoryInput.placeholder = tr("options.promptCategory");
  categoryInput.setAttribute("aria-label", tr("options.promptCategoryInput"));

  const categoryWrapper = document.createElement("div");
  categoryWrapper.className = "category-combobox category-combobox-inline";
  categoryWrapper.append(categoryInput);
  attachCategoryCombobox(categoryWrapper, categoryInput, promptTemplateCategories);

  fields.append(titleInput, categoryWrapper);
  head.append(fields, entryActions(template.id, "deletePromptId", tr("options.removePrompt")));
  entry.append(head);

  const body = document.createElement("textarea");
  body.className = "entry-textarea";
  body.name = "body";
  body.rows = 4;
  body.value = template.body;
  body.placeholder = tr("options.promptBody");
  body.spellcheck = true;
  body.setAttribute("aria-label", tr("options.promptBody"));
  entry.append(body);

  const status = document.createElement("span");
  status.className = "entry-status";
  status.dataset.role = "status";
  const foot = document.createElement("div");
  foot.className = "entry-foot";
  foot.append(status);
  entry.append(foot);

  return entry;
}

function entryActions(id: string, datasetKey: "deleteId" | "deletePromptId", removeLabel: string): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "entry-actions";

  const remove = document.createElement("button");
  remove.className = "icon-button danger";
  remove.type = "button";
  remove.setAttribute("aria-label", removeLabel);
  remove.title = removeLabel;
  if (datasetKey === "deleteId") {
    remove.dataset.deleteId = id;
  } else {
    remove.dataset.deletePromptId = id;
  }
  remove.append(svgIcon("M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"));

  actions.append(remove);
  return actions;
}

function svgIcon(path: string): SVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", path);
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  svg.append(p);
  return svg;
}

function createEntryIcon(iconUrl: string | undefined, fallback: string): HTMLElement {
  if (iconUrl) {
    const img = document.createElement("img");
    img.className = "entry-icon";
    img.src = iconUrl;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    return img;
  }
  const span = document.createElement("span");
  span.className = "entry-icon";
  span.textContent = fallback;
  return span;
}

function emptyState(title: string, copy: string): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const p = document.createElement("p");
  p.textContent = copy;
  empty.append(strong, p);
  return empty;
}

async function handleCustomUrlBlur(id: string, input: HTMLInputElement, entry: HTMLElement): Promise<void> {
  const customUrl = settings.customUrls.find((entry) => entry.id === id);
  if (!customUrl) {
    return;
  }

  if (input.name === "url") {
    const next = normalizeUserUrl(input.value);
    if (!next) {
      input.classList.add("is-invalid");
      showEntryStatus(entry, tr("options.customUrlError"), "error");
      input.value = customUrl.url;
      setTimeout(() => input.classList.remove("is-invalid"), 1200);
      return;
    }
    input.classList.remove("is-invalid");
    if (next === customUrl.url) {
      return;
    }
    customUrl.url = next;
    input.value = next;
    settings.lastUrlByPreset[makeCustomPresetId(id)] = next;
    await persistEntry(entry);
    void refreshIconForCustomUrl(id, next, entry);
    return;
  }

  if (input.name === "label") {
    const next = input.value.trim() || labelFromUrl(customUrl.url);
    if (next === customUrl.label) {
      return;
    }
    customUrl.label = next;
    input.value = next;
    await persistEntry(entry);
  }
}

async function handlePromptTemplateBlur(
  id: string,
  input: HTMLInputElement | HTMLTextAreaElement,
  entry: HTMLElement
): Promise<void> {
  const template = customPromptTemplates.find((item) => item.id === id);
  if (!template) {
    return;
  }

  const value = input.value.trim();

  if (input.name === "title") {
    if (!value) {
      input.classList.add("is-invalid");
      showEntryStatus(entry, tr("common.titleRequired"), "error");
      input.value = template.title;
      setTimeout(() => input.classList.remove("is-invalid"), 1200);
      return;
    }
    input.classList.remove("is-invalid");
    if (value === template.title) {
      return;
    }
    await queuePromptTemplateOperation(id, async () => {
      if (deletedPromptTemplateIds.has(id)) {
        return;
      }
      customPromptTemplates = await updateCustomPromptTemplatePatch(id, { title: value });
      showEntryStatus(entry, tr("common.saved"), "saved");
    });
    return;
  }

  if (input.name === "category") {
    if (value === template.category) {
      return;
    }
    await queuePromptTemplateOperation(id, async () => {
      if (deletedPromptTemplateIds.has(id)) {
        return;
      }
      customPromptTemplates = await updateCustomPromptTemplatePatch(id, { category: value });
      const destinationKey = value || UNCATEGORIZED_CATEGORY_KEY;
      collapsedPromptTemplateCategories.delete(destinationKey);
      showEntryStatus(entry, tr("common.saved"), "saved");
      renderPromptTemplates();
    });
    return;
  }

  if (input.name === "body") {
    if (!value) {
      input.classList.add("is-invalid");
      showEntryStatus(entry, tr("options.promptBodyRequired"), "error");
      input.value = template.body;
      setTimeout(() => input.classList.remove("is-invalid"), 1200);
      return;
    }
    input.classList.remove("is-invalid");
    if (value === template.body) {
      return;
    }
    await queuePromptTemplateOperation(id, async () => {
      if (deletedPromptTemplateIds.has(id)) {
        return;
      }
      customPromptTemplates = await updateCustomPromptTemplatePatch(id, { body: value });
      showEntryStatus(entry, tr("common.saved"), "saved");
    });
  }
}

async function persistEntry(entry: HTMLElement): Promise<void> {
  settings = await saveSettings(settings);
  showEntryStatus(entry, tr("common.saved"), "saved");
}

function refreshEntryIcon(entry: HTMLElement, customUrl: CustomUrl): void {
  const existing = entry.querySelector(".entry-icon");
  if (!existing) {
    return;
  }
  const replacement = createEntryIcon(customUrl.iconUrl, serviceInitial(customUrl.label));
  existing.replaceWith(replacement);
}

async function refreshIconForCustomUrl(id: string, url: string, entry?: HTMLElement): Promise<void> {
  try {
    const iconUrl = await findIconForUrl(url);
    const latest = await getSettings();
    const customUrl = latest.customUrls.find((item) => item.id === id && item.url === url);
    if (!customUrl) {
      return;
    }

    customUrl.iconUrl = iconUrl;
    customUrl.iconUpdatedAt = iconUrl ? Date.now() : undefined;
    settings = await saveSettings(latest);
    const targetEntry = entry?.isConnected ? entry : customUrlList.querySelector<HTMLElement>(`.entry[data-entry-id="${CSS.escape(id)}"]`) ?? undefined;
    if (targetEntry) {
      refreshEntryIcon(targetEntry, customUrl);
      showEntryStatus(targetEntry, iconUrl ? tr("options.iconUpdated") : tr("common.saved"), "saved");
    }
  } catch {
    // Favicon discovery is best-effort and must not block URL saving.
  }
}

async function queuePromptTemplateOperation(id: string, operation: () => Promise<void>): Promise<void> {
  const previous = promptTemplateOperations.get(id) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(operation)
    .catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    })
    .finally(() => {
      if (promptTemplateOperations.get(id) === next) {
        promptTemplateOperations.delete(id);
      }
    });
  promptTemplateOperations.set(id, next);
  await next;
}

function showEntryStatus(entry: HTMLElement, message: string, tone: "saved" | "error"): void {
  const status = entry.querySelector<HTMLElement>("[data-role='status']");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.remove("is-saved", "is-error");
  status.classList.add("is-shown", tone === "saved" ? "is-saved" : "is-error");
  setTimeout(() => {
    if (status.textContent === message) {
      status.classList.remove("is-shown");
    }
  }, ENTRY_STATUS_SHOW_MS);
}

async function addCustomUrl(): Promise<void> {
  const url = normalizeUserUrl(customUrlInput.value);
  if (!url) {
    setStatus(tr("options.customUrlError"));
    return;
  }

  const label = customLabelInput.value.trim() || labelFromUrl(url);
  const id = crypto.randomUUID();
  settings.customUrls.push({
    id,
    label,
    url,
    createdAt: Date.now()
  });

  customLabelInput.value = "";
  customUrlInput.value = "";
  settings = await saveSettings(settings);
  setStatus(tr("options.customUrlAdded"));
  render();
  void refreshIconForCustomUrl(id, url);
}

async function deleteCustomUrl(id: string): Promise<void> {
  if (!confirmAction(tr("options.confirmRemoveUrl"))) {
    return;
  }

  const presetId = makeCustomPresetId(id);
  settings.customUrls = settings.customUrls.filter((customUrl) => customUrl.id !== id);
  delete settings.lastUrlByPreset[presetId];
  settings.serviceOrder = settings.serviceOrder.filter((id) => id !== presetId);
  settings.hiddenServiceIds = settings.hiddenServiceIds.filter((id) => id !== presetId);

  if (settings.defaultPresetId === presetId) {
    settings.defaultPresetId = DEFAULT_PRESET_ID;
  }
  if (settings.activePresetId === presetId) {
    settings.activePresetId = settings.defaultPresetId;
  }

  settings = await saveSettings(settings);
  setStatus(tr("options.customUrlRemoved"));
  render();
}

async function addPromptTemplate(): Promise<void> {
  const title = promptTitleInput.value.trim();
  const category = promptCategoryInput.value.trim();
  const body = promptBodyInput.value.trim();

  if (!title || !body) {
    setStatus(tr("options.promptTemplateError"));
    return;
  }

  promptSubmitButton.disabled = true;
  try {
    customPromptTemplates = await addCustomPromptTemplate({ title, category: category || tr("options.promptCategoryPlaceholder"), body, favorite: true });
    promptTitleInput.value = "";
    promptCategoryInput.value = "";
    promptBodyInput.value = "";
    renderPromptTemplates();
    setStatus(tr("options.promptAdded"));
  } finally {
    promptSubmitButton.disabled = false;
  }
}

async function removePromptTemplate(id: string): Promise<void> {
  if (!confirmAction(tr("options.confirmRemovePrompt"))) {
    return;
  }

  deletedPromptTemplateIds.add(id);
  await queuePromptTemplateOperation(id, async () => {
    customPromptTemplates = await deleteCustomPromptTemplate(id);
    renderPromptTemplates();
    setStatus(tr("options.promptRemoved"));
  });
}

async function resetSettings(): Promise<void> {
  if (!confirmAction(tr("options.confirmReset"))) {
    return;
  }

  const defaults = defaultSettings();
  resetSettingsButton.disabled = true;

  try {
    settings = await saveSettings(defaults);
    customLabelInput.value = "";
    customUrlInput.value = "";
    render();
    setStatus(tr("options.settingsReset"));
  } finally {
    resetSettingsButton.disabled = false;
  }
}

async function setLanguage(value: string): Promise<void> {
  const next = value === "en" || value === "ja" || value === "auto" ? value : "auto";
  if (settings.language === next) {
    return;
  }
  settings.language = next;
  settings = await saveSettings(settings);
  uiLanguage = resolveUiLanguage();
  localizeStaticUi();
  render();
  setStatus(tr("options.languageUpdated"));
}

async function migrateBareCustomDefault(): Promise<void> {
  if (settings.defaultPresetId !== CUSTOM_PRESET_ID) {
    return;
  }

  const url = normalizeUserUrl(settings.lastUrlByPreset[CUSTOM_PRESET_ID] || "");
  if (!url) {
    settings.defaultPresetId = DEFAULT_PRESET_ID;
    if (settings.activePresetId === CUSTOM_PRESET_ID) {
      settings.activePresetId = DEFAULT_PRESET_ID;
    }
    settings = await saveSettings(settings);
    return;
  }

  const id = crypto.randomUUID();
  const presetId = makeCustomPresetId(id);
  settings.customUrls.push({
    id,
    label: labelFromUrl(url),
    url,
    createdAt: Date.now()
  });
  settings.defaultPresetId = presetId;
  settings.activePresetId = presetId;
  settings.lastUrlByPreset[presetId] = url;
  settings = await saveSettings(settings);
  void refreshIconForCustomUrl(id, url);
}

async function setQuickAccessVisible(id: ActivePresetId, visible: boolean): Promise<void> {
  if (visible) {
    settings.hiddenServiceIds = settings.hiddenServiceIds.filter((serviceId) => serviceId !== id);
    if (!settings.serviceOrder.includes(id)) {
      settings.serviceOrder.push(id);
    }
    settings = await saveSettings(settings);
    setStatus(tr("options.quickAccessAdded"));
    render();
    return;
  }

  if (visibleQuickAccessCount() <= 1 && isQuickAccessVisible(id)) {
    setStatus(tr("options.keepOneQuickAccess"));
    render();
    return;
  }

  if (!settings.hiddenServiceIds.includes(id)) {
    settings.hiddenServiceIds.push(id);
  }
  settings = await saveSettings(settings);
  setStatus(tr("options.quickAccessHidden"));
  render();
}

function isQuickAccessVisible(id: ActivePresetId): boolean {
  return !settings.hiddenServiceIds.includes(id);
}

function visibleQuickAccessCount(): number {
  return quickAccessOptions().filter((service) => isQuickAccessVisible(service.id)).length;
}

function quickAccessOptions(): { id: ActivePresetId; label: string; url: string; iconUrl?: string }[] {
  const custom = settings.customUrls.map((customUrl) => ({
    id: makeCustomPresetId(customUrl.id),
    label: customUrl.label,
    url: customUrl.url,
    iconUrl: customUrl.iconUrl
  }));
  const builtIns = BUILT_IN_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    url: settings.lastUrlByPreset[preset.id] || preset.url,
    iconUrl: SERVICE_ICON_SRC[preset.id]
  }));
  const byId = new Map<ActivePresetId, { id: ActivePresetId; label: string; url: string; iconUrl?: string }>(
    [...builtIns, ...custom].map((service) => [service.id, service])
  );
  const orderedIds = [
    ...settings.serviceOrder.filter((id) => byId.has(id)),
    ...[...byId.keys()].filter((id) => !settings.serviceOrder.includes(id))
  ];
  return orderedIds.map((id) => byId.get(id)).filter((service): service is { id: ActivePresetId; label: string; url: string; iconUrl?: string } => !!service);
}

function serviceInitial(label: string): string {
  return (label.trim().match(/[A-Za-z0-9]/)?.[0] || label.trim().charAt(0) || "?").toUpperCase();
}

async function findIconForUrl(url: string): Promise<string | undefined> {
  const candidates = await iconCandidatesForUrl(url);
  for (const candidate of candidates) {
    if (await canLoadImage(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function iconCandidatesForUrl(url: string): Promise<string[]> {
  const candidates: string[] = [];
  const addCandidate = (value: string | null | undefined) => {
    const normalized = normalizeIconCandidate(value, url);
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  try {
    const response = await fetchWithTimeout(url, { credentials: "omit" }, FAVICON_FETCH_TIMEOUT_MS);
    if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
      const html = await readBoundedText(response, FAVICON_HTML_MAX_BYTES);
      if (html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel]"))) {
          const rel = link.rel.toLowerCase();
          if (rel.includes("apple-touch-icon") || rel.includes("icon")) {
            addCandidate(link.href || link.getAttribute("href"));
          }
          if (rel === "manifest") {
            await addCandidateFromManifest(link.href || link.getAttribute("href"), url, addCandidate);
          }
        }
      }
    }
  } catch {
    // Cross-origin pages often block HTML reads; /favicon.ico remains a safe fallback.
  }

  addCandidate(new URL("/favicon.ico", url).href);
  return candidates;
}

async function addCandidateFromManifest(
  manifestUrl: string | null | undefined,
  pageUrl: string,
  addCandidate: (value: string | null | undefined) => void
): Promise<void> {
  const normalizedManifestUrl = normalizeIconCandidate(manifestUrl, pageUrl);
  if (!normalizedManifestUrl) {
    return;
  }

  try {
    const response = await fetchWithTimeout(normalizedManifestUrl, { credentials: "omit" }, FAVICON_FETCH_TIMEOUT_MS);
    if (!response.ok) {
      return;
    }
    const body = await readBoundedText(response, FAVICON_MANIFEST_MAX_BYTES);
    if (!body) {
      return;
    }
    let manifest: unknown;
    try {
      manifest = JSON.parse(body);
    } catch {
      return;
    }
    if (!manifest || typeof manifest !== "object" || !Array.isArray((manifest as { icons?: unknown }).icons)) {
      return;
    }
    const icons = (manifest as { icons: unknown[] }).icons.slice(0, FAVICON_MANIFEST_ICON_LIMIT);
    for (const icon of icons) {
      if (icon && typeof icon === "object" && typeof (icon as { src?: unknown }).src === "string") {
        try {
          addCandidate(new URL((icon as { src: string }).src, normalizedManifestUrl).href);
        } catch {
          // Skip malformed icon entries.
        }
      }
    }
  } catch {
    // Manifest discovery is opportunistic.
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return null;
  }

  const body = response.body;
  if (!body) {
    const text = await response.text();
    return text.length > maxBytes ? null : text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

function normalizeIconCandidate(value: string | null | undefined, baseUrl: string): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const parsed = new URL(value.trim(), baseUrl);
    const base = new URL(baseUrl);
    if (parsed.origin !== base.origin) {
      return undefined;
    }
    if (parsed.protocol === "https:" || (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"))) {
      return parsed.href;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function canLoadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve(false);
    }, FAVICON_IMAGE_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    image.src = url;
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function setStatus(message: string): void {
  statusText.textContent = message;
  if (statusTimer !== undefined) {
    clearTimeout(statusTimer);
  }
  statusTimer = setTimeout(() => {
    statusText.textContent = "";
    statusTimer = undefined;
  }, STATUS_RESET_MS);
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element: ${id}`);
  }
  return found as T;
}
