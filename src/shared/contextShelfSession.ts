export const PENDING_CONTEXT_SHELF_ITEMS_KEY = "composer.pendingContextShelfItems";
export const PENDING_CONTEXT_SHELF_LIMIT = 20;

export type PendingContextShelfItem = {
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

function createPendingContextShelfId(text: string): string {
  const seed = text.slice(0, 2048);
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `pending-shelf-${hash.toString(36)}`;
}
