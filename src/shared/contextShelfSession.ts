export const PENDING_CONTEXT_SHELF_ITEMS_KEY = "composer.pendingContextShelfItems";
export const CONTEXT_SHELF_ITEMS_KEY = "composer.contextShelfItems";
export const PROMPT_DRAFT_KEY = "composer.promptDraft";
export const PROMPT_DRAFT_TARGET_KEY = "composer.promptDraftTarget";

export const CONTEXT_SHELF_ITEM_LIMIT = 20;
export const PENDING_CONTEXT_SHELF_LIMIT = CONTEXT_SHELF_ITEM_LIMIT;

export const UNCATEGORIZED_CATEGORY_KEY = "__uncategorized__";

export type PendingContextShelfItem = {
  id: string;
  title: string;
  subtitle: string;
  text: string;
  createdAt: number;
};

export type StoredContextShelfItem = {
  id: string;
  title: string;
  subtitle: string;
  text: string;
  createdAt: number;
};

export function normalizePendingContextShelfItems(value: unknown): PendingContextShelfItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): PendingContextShelfItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const candidate = item as Partial<PendingContextShelfItem>;
      if (typeof candidate.text !== "string" || !candidate.text.trim()) {
        return null;
      }
      return {
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : createPendingContextShelfId(candidate.text),
        title: typeof candidate.title === "string" && candidate.title ? candidate.title : "Selection",
        subtitle: typeof candidate.subtitle === "string" ? candidate.subtitle : "",
        text: candidate.text.trim(),
        createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : Date.now()
      };
    })
    .filter((item): item is PendingContextShelfItem => !!item)
    .slice(0, PENDING_CONTEXT_SHELF_LIMIT);
}

export function normalizeStoredContextShelfItems(value: unknown): StoredContextShelfItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): StoredContextShelfItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const candidate = item as Partial<StoredContextShelfItem>;
      if (typeof candidate.text !== "string" || !candidate.text.trim()) {
        return null;
      }
      return {
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : createPendingContextShelfId(candidate.text),
        title: typeof candidate.title === "string" && candidate.title ? candidate.title : "",
        subtitle: typeof candidate.subtitle === "string" ? candidate.subtitle : "",
        text: candidate.text,
        createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : Date.now()
      };
    })
    .filter((item): item is StoredContextShelfItem => !!item)
    .slice(0, CONTEXT_SHELF_ITEM_LIMIT);
}

function createPendingContextShelfId(text: string): string {
  const seed = text.slice(0, 2048);
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `pending-shelf-${hash.toString(36)}`;
}
