import {
  BUILT_IN_PRESETS,
  CUSTOM_PRESET_ID,
  DEFAULT_HIDDEN_PRESET_IDS,
  DEFAULT_PRESET_ID,
  isBuiltInPresetId,
  makeCustomPresetId,
  parseCustomPresetId
} from "./presets.js";
import type { ActivePresetId, CustomUrl, DiagnosticEntry, DiagnosticStatus, Settings, SidePanelChromeSettings } from "./types.js";
import { normalizeUserUrl } from "./url.js";

export const SETTINGS_KEY = "anyside.settings";
export const FALLBACK_WINDOW_KEY = "anyside.fallbackWindow";

const LEGACY_SETTINGS_KEY = "aiSidecar.settings";
const REMOVED_PRESET_IDS = new Set(["keep"]);

function defaultLastUrlByPreset(): Record<string, string> {
  const entries = BUILT_IN_PRESETS.map((preset) => [preset.id, preset.url]);
  entries.push([CUSTOM_PRESET_ID, ""]);
  return Object.fromEntries(entries);
}

export function defaultSettings(): Settings {
  return {
    defaultPresetId: DEFAULT_PRESET_ID,
    activePresetId: DEFAULT_PRESET_ID,
    customUrls: [],
    serviceOrder: BUILT_IN_PRESETS.map((preset) => preset.id),
    hiddenServiceIds: [...DEFAULT_HIDDEN_PRESET_IDS],
    quickAccessConfigured: true,
    sidePanelChrome: {
      headerCollapsed: false,
      footerCollapsed: false
    },
    lastUrlByPreset: defaultLastUrlByPreset(),
    enableFrameHeaderRelaxation: false,
    frameHeaderRelaxationAcknowledged: false,
    diagnostics: {}
  };
}

const DIAGNOSTIC_STATUSES: DiagnosticStatus[] = ["untested", "pending", "loaded", "timeout", "manual-pass", "manual-fail"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeCustomUrls(value: unknown): CustomUrl[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const customUrls: CustomUrl[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string") {
      continue;
    }

    const id = item.id.trim();
    if (!id || seenIds.has(id)) {
      continue;
    }

    const url = typeof item.url === "string" ? normalizeUserUrl(item.url) : null;
    if (!url) {
      continue;
    }

    seenIds.add(id);
    const customUrl: CustomUrl = {
      id,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : url,
      url,
      createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now()
    };
    const iconUrl = typeof item.iconUrl === "string" ? normalizeIconUrl(item.iconUrl, url) : undefined;
    if (iconUrl) {
      customUrl.iconUrl = iconUrl;
      if (typeof item.iconUpdatedAt === "number") {
        customUrl.iconUpdatedAt = item.iconUpdatedAt;
      }
    }

    customUrls.push(customUrl);
  }

  return customUrls;
}

function isKnownActivePresetId(value: unknown, customUrls: CustomUrl[]): value is ActivePresetId {
  if (typeof value !== "string") {
    return false;
  }

  if (REMOVED_PRESET_IDS.has(value)) {
    return false;
  }

  if (isBuiltInPresetId(value) || value === CUSTOM_PRESET_ID) {
    return true;
  }

  const customId = parseCustomPresetId(value);
  return !!customId && customUrls.some((entry) => entry.id === customId);
}

function normalizeActivePresetId(value: unknown, fallback: ActivePresetId, customUrls: CustomUrl[]): ActivePresetId {
  return isKnownActivePresetId(value, customUrls) ? value : fallback;
}

function knownServiceIds(customUrls: CustomUrl[]): ActivePresetId[] {
  return [
    ...BUILT_IN_PRESETS.map((preset) => preset.id),
    ...customUrls.map((customUrl) => makeCustomPresetId(customUrl.id))
  ];
}

function normalizeServiceIdList(value: unknown, customUrls: CustomUrl[], options: { appendMissing: boolean }): ActivePresetId[] {
  const knownIds = knownServiceIds(customUrls);
  const knownSet = new Set<ActivePresetId>(knownIds);
  const output: ActivePresetId[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && knownSet.has(item as ActivePresetId) && !output.includes(item as ActivePresetId)) {
        output.push(item as ActivePresetId);
      }
    }
  }

  if (options.appendMissing) {
    for (const id of knownIds) {
      if (!output.includes(id)) {
        output.push(id);
      }
    }
  }

  return output;
}

function ensureVisibleActivePreset(
  activePresetId: ActivePresetId,
  defaultPresetId: ActivePresetId,
  hiddenServiceIds: ActivePresetId[],
  serviceOrder: ActivePresetId[]
): { activePresetId: ActivePresetId; defaultPresetId: ActivePresetId } {
  const visibleIds = serviceOrder.filter((id) => !hiddenServiceIds.includes(id));
  const fallback = visibleIds[0] || DEFAULT_PRESET_ID;
  const nextDefaultPresetId = hiddenServiceIds.includes(defaultPresetId) ? fallback : defaultPresetId;
  const nextActivePresetId = hiddenServiceIds.includes(activePresetId) ? nextDefaultPresetId : activePresetId;
  return {
    activePresetId: nextActivePresetId,
    defaultPresetId: nextDefaultPresetId
  };
}

function normalizeLastUrlByPreset(value: unknown, customUrls: CustomUrl[]): Record<string, string> {
  const output = defaultLastUrlByPreset();
  const input = isRecord(value) ? value : {};

  for (const preset of BUILT_IN_PRESETS) {
    const storedUrl = input[preset.id];
    output[preset.id] = typeof storedUrl === "string" && storedUrl ? storedUrl : preset.url;
  }

  output[CUSTOM_PRESET_ID] = typeof input[CUSTOM_PRESET_ID] === "string" ? normalizeUserUrl(input[CUSTOM_PRESET_ID]) || "" : "";

  for (const customUrl of customUrls) {
    const presetId = makeCustomPresetId(customUrl.id);
    output[presetId] = typeof input[presetId] === "string" ? normalizeUserUrl(input[presetId]) || customUrl.url : customUrl.url;
  }

  return output;
}

function normalizeSidePanelChrome(value: unknown): SidePanelChromeSettings {
  if (!isRecord(value)) {
    return {
      headerCollapsed: false,
      footerCollapsed: false
    };
  }

  return {
    headerCollapsed: value.headerCollapsed === true,
    footerCollapsed: value.footerCollapsed === true
  };
}

function isDiagnosticStatus(value: unknown): value is DiagnosticStatus {
  return typeof value === "string" && DIAGNOSTIC_STATUSES.includes(value as DiagnosticStatus);
}

function normalizeIconUrl(value: string, baseUrl: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, baseUrl);
    if (parsed.protocol === "https:") {
      return parsed.href;
    }
    if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) {
      return parsed.href;
    }
  } catch {
    // Invalid icon URLs are ignored; the UI falls back to an initial badge.
  }

  return undefined;
}

function normalizeDiagnostics(value: unknown): Record<string, DiagnosticEntry> {
  if (!isRecord(value)) {
    return {};
  }

  const diagnostics: Record<string, DiagnosticEntry> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isRecord(entry) || !isKnownDiagnosticEntry(entry)) {
      continue;
    }

    diagnostics[key] = {
      presetId: entry.presetId,
      url: entry.url,
      dnrEnabled: entry.dnrEnabled,
      status: entry.status,
      startedAt: entry.startedAt,
      finishedAt: typeof entry.finishedAt === "number" ? entry.finishedAt : undefined,
      message: typeof entry.message === "string" ? entry.message : undefined
    };
  }

  return diagnostics;
}

function isKnownDiagnosticEntry(entry: Record<string, unknown>): entry is DiagnosticEntry {
  return (
    typeof entry.presetId === "string" &&
    isBuiltInPresetId(entry.presetId) &&
    typeof entry.url === "string" &&
    typeof entry.dnrEnabled === "boolean" &&
    isDiagnosticStatus(entry.status) &&
    typeof entry.startedAt === "number"
  );
}

export function normalizeSettings(value: unknown): Settings {
  const defaults = defaultSettings();
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const input = value as Partial<Settings>;
  const customUrls = normalizeCustomUrls(input.customUrls);
  const defaultPresetId = normalizeActivePresetId(input.defaultPresetId, defaults.defaultPresetId, customUrls);
  const activePresetId = normalizeActivePresetId(input.activePresetId, defaultPresetId, customUrls);
  const serviceOrder = normalizeServiceIdList(input.serviceOrder, customUrls, { appendMissing: true });
  const quickAccessConfigured = input.quickAccessConfigured === true;
  let hiddenServiceIds = normalizeServiceIdList(input.hiddenServiceIds, customUrls, { appendMissing: false });
  if (!quickAccessConfigured) {
    for (const id of DEFAULT_HIDDEN_PRESET_IDS) {
      if (!hiddenServiceIds.includes(id)) {
        hiddenServiceIds.push(id);
      }
    }
  }
  if (serviceOrder.every((id) => hiddenServiceIds.includes(id))) {
    hiddenServiceIds = hiddenServiceIds.filter((id) => id !== DEFAULT_PRESET_ID);
  }
  const visibleActive = ensureVisibleActivePreset(activePresetId, defaultPresetId, hiddenServiceIds, serviceOrder);
  const frameHeaderRelaxationAcknowledged = input.frameHeaderRelaxationAcknowledged === true;
  const enableFrameHeaderRelaxation = input.enableFrameHeaderRelaxation === true && frameHeaderRelaxationAcknowledged;
  const frameHeaderRelaxationChangeId =
    typeof input.frameHeaderRelaxationChangeId === "string" && input.frameHeaderRelaxationChangeId.trim()
      ? input.frameHeaderRelaxationChangeId.trim()
      : undefined;

  return {
    defaultPresetId: visibleActive.defaultPresetId,
    activePresetId: visibleActive.activePresetId,
    customUrls,
    serviceOrder,
    hiddenServiceIds,
    quickAccessConfigured: true,
    sidePanelChrome: normalizeSidePanelChrome(input.sidePanelChrome),
    lastUrlByPreset: normalizeLastUrlByPreset(input.lastUrlByPreset, customUrls),
    enableFrameHeaderRelaxation,
    frameHeaderRelaxationAcknowledged,
    frameHeaderRelaxationChangeId,
    diagnostics: normalizeDiagnostics(input.diagnostics)
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, LEGACY_SETTINGS_KEY]);
  if (stored[SETTINGS_KEY]) {
    return normalizeSettings(stored[SETTINGS_KEY]);
  }

  if (stored[LEGACY_SETTINGS_KEY]) {
    const migrated = normalizeSettings(stored[LEGACY_SETTINGS_KEY]);
    await chrome.storage.local.set({ [SETTINGS_KEY]: migrated });
    await chrome.storage.local.remove(LEGACY_SETTINGS_KEY);
    return migrated;
  }

  return defaultSettings();
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const normalized = normalizeSettings(settings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalized });
  return normalized;
}

export async function updateSettings(mutator: (settings: Settings) => Settings | void): Promise<Settings> {
  const current = await getSettings();
  const next = mutator(current) ?? current;
  return saveSettings(next);
}
