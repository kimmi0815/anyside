import type { AIService, InsertResult, PageContext } from "../features/composer/types.js";

export type PresetId = "chatgpt" | "claude" | "gemini" | "perplexity" | "notebooklm";

export type ActivePresetId = PresetId | "custom" | `custom:${string}`;

export type BuiltInPreset = {
  id: PresetId;
  label: string;
  url: string;
};

export type CustomUrl = {
  id: string;
  label: string;
  url: string;
  iconUrl?: string;
  iconUpdatedAt?: number;
  createdAt: number;
};

export type DiagnosticStatus = "untested" | "pending" | "loaded" | "timeout" | "manual-pass" | "manual-fail";

export type DiagnosticEntry = {
  presetId: PresetId;
  url: string;
  dnrEnabled: boolean;
  status: DiagnosticStatus;
  startedAt: number;
  finishedAt?: number;
  message?: string;
};

export type SidePanelChromeSettings = {
  headerCollapsed: boolean;
  footerCollapsed: boolean;
};

export type Settings = {
  defaultPresetId: ActivePresetId;
  activePresetId: ActivePresetId;
  customUrls: CustomUrl[];
  serviceOrder: ActivePresetId[];
  hiddenServiceIds: ActivePresetId[];
  sidePanelChrome: SidePanelChromeSettings;
  lastUrlByPreset: Record<string, string>;
  enableFrameHeaderRelaxation: boolean;
  frameHeaderRelaxationAcknowledged: boolean;
  frameHeaderRelaxationChangeId?: string;
  diagnostics: Record<string, DiagnosticEntry>;
};

export type ResolvedTarget = {
  id: ActivePresetId;
  label: string;
  url: string;
  isCustom: boolean;
};

export type FallbackWindowState = {
  windowId?: number;
  tabId?: number;
  url?: string;
  updatedAt?: number;
};

export type RuntimeMessage =
  | { type: "START_FRAME_COMPATIBILITY_SESSION"; presetId: PresetId; url: string; enabled: boolean }
  | { type: "END_FRAME_COMPATIBILITY_SESSION"; sessionId: string }
  | { type: "COPY_ACTIVE_TAB_PROMPT" }
  | { type: "COPY_TEXT"; text: string }
  | { type: "GET_PAGE_CONTEXT" }
  | { type: "INSERT_TEXT_TO_AI"; text: string; service: AIService; url: string }
  | { type: "OPEN_FALLBACK_WINDOW"; url: string }
  | { type: "OPEN_SIDE_PANEL" }
  | { type: "OFFSCREEN_COPY_TEXT"; target: "offscreen"; text: string };

export type RuntimeResponse = {
  ok: boolean;
  error?: string;
  settings?: Settings;
  frameCompatibilitySessionId?: string;
  windowId?: number;
  text?: string;
  pageContext?: PageContext;
  insertResult?: InsertResult;
};
