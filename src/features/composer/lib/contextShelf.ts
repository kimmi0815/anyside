export type ContextShelfItemKind = "selection" | "title_url" | "page_text";
export type ContextShelfLanguage = "en" | "ja";

export type ContextShelfItem = {
  id: string;
  kind: ContextShelfItemKind;
  title: string;
  text: string;
  url?: string;
  domain?: string;
  createdAt: number;
  truncated?: boolean;
};

export const CONTEXT_SHELF_MAX_ITEMS = 10;
export const CONTEXT_SHELF_ITEM_TEXT_LIMIT = 24_000;

export function createContextShelfItem(
  input: Omit<ContextShelfItem, "id" | "createdAt" | "text"> & { text: string; id?: string; createdAt?: number }
): ContextShelfItem | null {
  const text = normalizeText(input.text).slice(0, CONTEXT_SHELF_ITEM_TEXT_LIMIT);
  if (!text) {
    return null;
  }

  return {
    id: input.id || stableShelfItemId(input.kind, input.title, text, input.url),
    kind: input.kind,
    title: normalizeText(input.title) || defaultTitle(input.kind),
    text,
    url: normalizeText(input.url || "") || undefined,
    domain: normalizeText(input.domain || "") || undefined,
    createdAt: input.createdAt ?? 0,
    truncated: input.truncated || input.text.length > CONTEXT_SHELF_ITEM_TEXT_LIMIT
  };
}

export function addContextShelfItem(
  items: ContextShelfItem[],
  item: ContextShelfItem,
  maxItems = CONTEXT_SHELF_MAX_ITEMS
): ContextShelfItem[] {
  return [...items, item].slice(Math.max(0, items.length + 1 - maxItems));
}

export function removeContextShelfItem(items: ContextShelfItem[], id: string): ContextShelfItem[] {
  return items.filter((item) => item.id !== id);
}

export function deleteContextShelfItem(items: ContextShelfItem[], id: string): ContextShelfItem[] {
  return removeContextShelfItem(items, id);
}

export function clearContextShelfItems(): ContextShelfItem[] {
  return [];
}

export function normalizeContextShelfItems(value: unknown): ContextShelfItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): ContextShelfItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const candidate = item as Partial<ContextShelfItem>;
      if (!isShelfKind(candidate.kind) || typeof candidate.text !== "string") {
        return null;
      }
      return createContextShelfItem({
        id: typeof candidate.id === "string" ? candidate.id : undefined,
        kind: candidate.kind,
        title: typeof candidate.title === "string" ? candidate.title : defaultTitle(candidate.kind),
        text: candidate.text,
        url: typeof candidate.url === "string" ? candidate.url : undefined,
        domain: typeof candidate.domain === "string" ? candidate.domain : undefined,
        createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : 0,
        truncated: candidate.truncated === true
      });
    })
    .filter((item): item is ContextShelfItem => !!item)
    .slice(-CONTEXT_SHELF_MAX_ITEMS);
}

export function formatContextShelfItems(items: ContextShelfItem[], language: ContextShelfLanguage = "ja"): string {
  return items
    .map((item, index) => {
      const label = shelfKindLabel(item.kind, language);
      const lines = [
        `#${index + 1} ${label}: ${item.title}`,
        item.url ? `URL: ${item.url}` : "",
        item.domain ? `Domain: ${item.domain}` : "",
        item.truncated ? truncatedLabel(language) : "",
        "",
        item.text
      ];
      return lines.filter((line, lineIndex) => lineIndex === 4 || line.trim()).join("\n");
    })
    .join("\n\n---\n\n")
    .trim();
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function stableShelfItemId(kind: ContextShelfItemKind, title: string, text: string, url?: string): string {
  const seed = `${kind}:${normalizeText(title)}:${normalizeText(url || "")}:${text}`.slice(0, 2048);
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `shelf-${hash.toString(36)}`;
}

function isShelfKind(value: unknown): value is ContextShelfItemKind {
  return value === "selection" || value === "title_url" || value === "page_text";
}

function defaultTitle(kind: ContextShelfItemKind): string {
  switch (kind) {
    case "selection":
      return "Selection";
    case "title_url":
      return "Title + URL";
    case "page_text":
      return "Page text";
  }
}

function shelfKindLabel(kind: ContextShelfItemKind, language: ContextShelfLanguage): string {
  if (language === "ja") {
    switch (kind) {
      case "selection":
        return "選択テキスト";
      case "title_url":
        return "タイトル + URL";
      case "page_text":
        return "本文";
    }
  }
  switch (kind) {
    case "selection":
      return "Selection";
    case "title_url":
      return "Title + URL";
    case "page_text":
      return "Page text";
  }
}

function truncatedLabel(language: ContextShelfLanguage): string {
  return language === "ja" ? "本文は上限に合わせて短縮されています。" : "Page text was truncated to fit the limit.";
}
