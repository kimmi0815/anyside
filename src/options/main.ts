import { BUILT_IN_PRESETS, CUSTOM_PRESET_ID, DEFAULT_PRESET_ID, makeCustomPresetId } from "../shared/presets.js";
import { defaultSettings, getSettings, normalizeSettings, saveSettings, SETTINGS_KEY } from "../shared/storage.js";
import {
  CUSTOM_PROMPT_TEMPLATES_KEY,
  addCustomPromptTemplate,
  deleteCustomPromptTemplate,
  getCustomPromptTemplates,
  normalizeCustomPromptTemplates,
  updateCustomPromptTemplate
} from "../storage/promptTemplateStorage.js";
import type { PromptTemplate } from "../features/composer/types.js";
import type { ActivePresetId, CustomUrl, Settings } from "../shared/types.js";
import { labelFromUrl, normalizeUserUrl } from "../shared/url.js";

const hiddenServiceList = element<HTMLElement>("hiddenServiceList");
const customUrlForm = element<HTMLFormElement>("customUrlForm");
const customLabelInput = element<HTMLInputElement>("customLabelInput");
const customUrlInput = element<HTMLInputElement>("customUrlInput");
const customUrlList = element<HTMLElement>("customUrlList");
const promptTemplateForm = element<HTMLFormElement>("promptTemplateForm");
const promptTitleInput = element<HTMLInputElement>("promptTitleInput");
const promptCategoryInput = element<HTMLInputElement>("promptCategoryInput");
const promptBodyInput = element<HTMLTextAreaElement>("promptBodyInput");
const promptSubmitButton = element<HTMLButtonElement>("promptSubmitButton");
const promptTemplateList = element<HTMLElement>("promptTemplateList");
const resetSettingsButton = element<HTMLButtonElement>("resetSettingsButton");
const statusText = element<HTMLElement>("statusText");
const aboutVersion = element<HTMLElement>("aboutVersion");
const CUSTOM_URL_ERROR = "Enter HTTPS, or http://localhost / http://127.0.0.1 for local testing. You can omit the protocol.";
const PROMPT_TEMPLATE_ERROR = "Prompt title and body are required.";
const STATUS_RESET_MS = 2000;
const ENTRY_STATUS_SHOW_MS = 1600;
const FAVICON_FETCH_TIMEOUT_MS = 2500;
const FAVICON_IMAGE_TIMEOUT_MS = 1500;

let settings: Settings;
let customPromptTemplates: PromptTemplate[] = [];
let statusTimer: number | undefined;
const promptTemplateOperations = new Map<string, Promise<void>>();
const deletedPromptTemplateIds = new Set<string>();

void init();

async function init(): Promise<void> {
  settings = await getSettings();
  customPromptTemplates = await getCustomPromptTemplates();
  await migrateBareCustomDefault();
  renderVersion();
  render();
  bindEvents();
  observeSections();
}

function bindEvents(): void {
  hiddenServiceList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.restoreServiceId) {
      return;
    }
    void restoreHiddenService(target.dataset.restoreServiceId as ActivePresetId);
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
    const button = target.closest<HTMLButtonElement>("button[data-delete-prompt-id]");
    if (button?.dataset.deletePromptId) {
      void removePromptTemplate(button.dataset.deletePromptId);
    }
  });

  resetSettingsButton.addEventListener("click", () => {
    void resetSettings();
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
  renderHiddenServices();
  renderCustomUrls();
  renderPromptTemplates();
}

function renderVersion(): void {
  const manifest = chrome.runtime.getManifest?.();
  if (manifest?.version) {
    aboutVersion.textContent = manifest.version;
  }
}

function renderHiddenServices(): void {
  hiddenServiceList.textContent = "";
  const hiddenServices = settings.hiddenServiceIds
    .map((id) => ({ id, label: serviceLabel(id) }))
    .filter((item) => item.label);
  if (hiddenServices.length === 0) {
    return;
  }

  const title = document.createElement("p");
  title.className = "hint";
  title.textContent = "Hidden from header";
  hiddenServiceList.append(title);

  const list = document.createElement("div");
  list.className = "restore-list";
  for (const service of hiddenServices) {
    const button = document.createElement("button");
    button.className = "button subtle";
    button.type = "button";
    button.dataset.restoreServiceId = service.id;
    button.textContent = `Show ${service.label}`;
    list.append(button);
  }
  hiddenServiceList.append(list);
}

function renderCustomUrls(): void {
  customUrlList.textContent = "";

  if (settings.customUrls.length === 0) {
    customUrlList.append(emptyState("No custom URLs yet", "Add a trusted AI workspace or local test page above, then switch to it from the side panel header."));
    return;
  }

  for (const customUrl of settings.customUrls) {
    customUrlList.append(customUrlEntry(customUrl));
  }
}

function renderPromptTemplates(): void {
  promptTemplateList.textContent = "";

  if (customPromptTemplates.length === 0) {
    promptTemplateList.append(emptyState("No custom prompts yet", "Add the prompts you reach for often, then use them from the Prompt palette."));
    return;
  }

  for (const template of customPromptTemplates) {
    promptTemplateList.append(promptTemplateEntry(template));
  }
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
  labelInput.placeholder = "Workspace name";
  labelInput.spellcheck = false;
  labelInput.setAttribute("aria-label", "Workspace name");

  const urlInput = document.createElement("input");
  urlInput.className = "entry-input is-secondary";
  urlInput.type = "text";
  urlInput.name = "url";
  urlInput.inputMode = "url";
  urlInput.value = customUrl.url;
  urlInput.placeholder = "https://example.com/";
  urlInput.spellcheck = false;
  urlInput.setAttribute("autocomplete", "url");
  urlInput.setAttribute("aria-label", "Workspace URL");

  fields.append(labelInput, urlInput);
  head.append(fields, entryActions(customUrl.id, "deleteId", "Remove this URL"));
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
  entry.className = "entry";
  entry.dataset.entryId = template.id;

  const head = document.createElement("div");
  head.className = "entry-head";

  head.append(createEntryIcon(undefined, serviceInitial(template.title)));

  const fields = document.createElement("div");
  fields.className = "entry-fields";

  const titleInput = document.createElement("input");
  titleInput.className = "entry-input";
  titleInput.type = "text";
  titleInput.name = "title";
  titleInput.value = template.title;
  titleInput.placeholder = "Prompt title";
  titleInput.setAttribute("aria-label", "Prompt title");

  const categoryInput = document.createElement("input");
  categoryInput.className = "entry-input is-secondary";
  categoryInput.type = "text";
  categoryInput.name = "category";
  categoryInput.value = template.category;
  categoryInput.placeholder = "Category";
  categoryInput.setAttribute("aria-label", "Prompt category");

  fields.append(titleInput, categoryInput);
  head.append(fields, entryActions(template.id, "deletePromptId", "Remove this prompt"));
  entry.append(head);

  const body = document.createElement("textarea");
  body.className = "entry-textarea";
  body.name = "body";
  body.rows = 4;
  body.value = template.body;
  body.placeholder = "Prompt body";
  body.spellcheck = true;
  body.setAttribute("aria-label", "Prompt body");
  entry.append(body);

  const foot = document.createElement("div");
  foot.className = "entry-foot";
  if (template.category) {
    const tag = document.createElement("span");
    tag.className = "entry-tag";
    tag.textContent = template.category;
    foot.append(tag);
  }
  const status = document.createElement("span");
  status.className = "entry-status";
  status.dataset.role = "status";
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
      showEntryStatus(entry, CUSTOM_URL_ERROR, "error");
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
      showEntryStatus(entry, "Title is required.", "error");
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
      customPromptTemplates = await updateCustomPromptTemplate(id, {
        title: value,
        category: template.category,
        body: template.body,
        favorite: template.favorite
      });
      showEntryStatus(entry, "Saved", "saved");
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
      customPromptTemplates = await updateCustomPromptTemplate(id, {
        title: template.title,
        category: value,
        body: template.body,
        favorite: template.favorite
      });
      showEntryStatus(entry, "Saved", "saved");
      renderPromptTemplates();
    });
    return;
  }

  if (input.name === "body") {
    if (!value) {
      input.classList.add("is-invalid");
      showEntryStatus(entry, "Prompt body is required.", "error");
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
      customPromptTemplates = await updateCustomPromptTemplate(id, {
        title: template.title,
        category: template.category,
        body: value,
        favorite: template.favorite
      });
      showEntryStatus(entry, "Saved", "saved");
    });
  }
}

async function persistEntry(entry: HTMLElement): Promise<void> {
  settings = await saveSettings(settings);
  showEntryStatus(entry, "Saved", "saved");
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
      showEntryStatus(targetEntry, iconUrl ? "Icon updated" : "Saved", "saved");
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
    setStatus(CUSTOM_URL_ERROR);
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
  setStatus("Custom URL added.");
  render();
  void refreshIconForCustomUrl(id, url);
}

async function deleteCustomUrl(id: string): Promise<void> {
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
  setStatus("Custom URL removed.");
  render();
}

async function addPromptTemplate(): Promise<void> {
  const title = promptTitleInput.value.trim();
  const category = promptCategoryInput.value.trim();
  const body = promptBodyInput.value.trim();

  if (!title || !body) {
    setStatus(PROMPT_TEMPLATE_ERROR);
    return;
  }

  promptSubmitButton.disabled = true;
  try {
    customPromptTemplates = await addCustomPromptTemplate({ title, category, body, favorite: true });
    promptTitleInput.value = "";
    promptCategoryInput.value = "";
    promptBodyInput.value = "";
    renderPromptTemplates();
    setStatus("Prompt added.");
  } finally {
    promptSubmitButton.disabled = false;
  }
}

async function removePromptTemplate(id: string): Promise<void> {
  deletedPromptTemplateIds.add(id);
  await queuePromptTemplateOperation(id, async () => {
    customPromptTemplates = await deleteCustomPromptTemplate(id);
    renderPromptTemplates();
    setStatus("Prompt removed.");
  });
}

async function resetSettings(): Promise<void> {
  const defaults = defaultSettings();
  resetSettingsButton.disabled = true;

  try {
    settings = await saveSettings(defaults);
    customLabelInput.value = "";
    customUrlInput.value = "";
    render();
    setStatus("Settings reset to defaults.");
  } finally {
    resetSettingsButton.disabled = false;
  }
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

async function restoreHiddenService(id: ActivePresetId): Promise<void> {
  settings.hiddenServiceIds = settings.hiddenServiceIds.filter((serviceId) => serviceId !== id);
  if (!settings.serviceOrder.includes(id)) {
    settings.serviceOrder.push(id);
  }
  settings = await saveSettings(settings);
  setStatus("Service restored to the header.");
  render();
}

function serviceLabel(id: ActivePresetId): string {
  const builtIn = BUILT_IN_PRESETS.find((preset) => preset.id === id);
  if (builtIn) {
    return builtIn.label;
  }

  const customId = id.startsWith("custom:") ? id.slice("custom:".length) : "";
  const customUrl = settings.customUrls.find((entry) => entry.id === customId);
  return customUrl?.label || "";
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
      const html = await response.text();
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
    const manifest = await response.json();
    if (!manifest || !Array.isArray(manifest.icons)) {
      return;
    }
    for (const icon of manifest.icons) {
      if (icon && typeof icon.src === "string") {
        addCandidate(new URL(icon.src, normalizedManifestUrl).href);
      }
    }
  } catch {
    // Manifest discovery is opportunistic.
  }
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
