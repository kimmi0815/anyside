export type PromptDraft = {
  text: string;
  updatedAt: number;
  lastTargetId?: string;
  lastAction?: "edit" | "insert" | "copy" | "clear";
};

export const PROMPT_DRAFT_TEXT_LIMIT = 60_000;

export function normalizePromptDraft(value: unknown): PromptDraft {
  if (!value || typeof value !== "object") {
    return emptyPromptDraft();
  }

  const draft = value as Partial<PromptDraft>;
  return {
    text: clampDraftText(typeof draft.text === "string" ? draft.text : ""),
    updatedAt: typeof draft.updatedAt === "number" ? draft.updatedAt : 0,
    lastTargetId: typeof draft.lastTargetId === "string" ? draft.lastTargetId : undefined,
    lastAction: isPromptDraftAction(draft.lastAction) ? draft.lastAction : undefined
  };
}

export function updatePromptDraftText(draft: PromptDraft, text: string, updatedAt = draft.updatedAt): PromptDraft {
  return {
    ...draft,
    text: clampDraftText(text),
    updatedAt,
    lastAction: "edit"
  };
}

export function setPromptDraftTarget(draft: PromptDraft, targetId: string, updatedAt = draft.updatedAt): PromptDraft {
  return {
    ...draft,
    lastTargetId: targetId,
    updatedAt
  };
}

export function markPromptDraftInserted(draft: PromptDraft, updatedAt = draft.updatedAt): PromptDraft {
  return {
    ...draft,
    updatedAt,
    lastAction: "insert"
  };
}

export function markPromptDraftCopied(draft: PromptDraft, updatedAt = draft.updatedAt): PromptDraft {
  return {
    ...draft,
    updatedAt,
    lastAction: "copy"
  };
}

export function clearPromptDraft(updatedAt = 0): PromptDraft {
  return {
    text: "",
    updatedAt,
    lastAction: "clear"
  };
}

export function promptDraftActionText(draft: PromptDraft): string {
  return draft.text.trim();
}

function emptyPromptDraft(): PromptDraft {
  return {
    text: "",
    updatedAt: 0
  };
}

function clampDraftText(text: string): string {
  return text.replace(/\r\n/g, "\n").slice(0, PROMPT_DRAFT_TEXT_LIMIT);
}

function isPromptDraftAction(value: unknown): value is PromptDraft["lastAction"] {
  return value === "edit" || value === "insert" || value === "copy" || value === "clear";
}
