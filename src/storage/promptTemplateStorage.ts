import type { PromptTemplate } from "../features/composer/types.js";

export const CUSTOM_PROMPT_TEMPLATES_KEY = "composer.promptTemplates";
export const CUSTOM_PROMPT_ID_PREFIX = "custom:";

type PromptTemplateInput = {
  title: string;
  category?: string;
  body: string;
  favorite?: boolean;
};

type PromptTemplatePatch = {
  title?: string;
  category?: string;
  body?: string;
  favorite?: boolean;
};

export async function getCustomPromptTemplates(): Promise<PromptTemplate[]> {
  const stored = await chrome.storage.local.get([CUSTOM_PROMPT_TEMPLATES_KEY]);
  return normalizeCustomPromptTemplates(stored[CUSTOM_PROMPT_TEMPLATES_KEY]);
}

export async function saveCustomPromptTemplates(templates: PromptTemplate[]): Promise<PromptTemplate[]> {
  const normalized = normalizeCustomPromptTemplates(templates);
  await chrome.storage.local.set({ [CUSTOM_PROMPT_TEMPLATES_KEY]: normalized });
  return normalized;
}

export async function addCustomPromptTemplate(input: PromptTemplateInput): Promise<PromptTemplate[]> {
  const now = Date.now();
  const templates = await getCustomPromptTemplates();
  templates.unshift({
    id: `${CUSTOM_PROMPT_ID_PREFIX}${crypto.randomUUID()}`,
    title: input.title.trim(),
    category: normalizeCategory(input.category),
    body: input.body.trim(),
    favorite: input.favorite ?? true,
    createdAt: now,
    updatedAt: now
  });
  return saveCustomPromptTemplates(templates);
}

export async function updateCustomPromptTemplate(id: string, input: PromptTemplateInput): Promise<PromptTemplate[]> {
  return updateCustomPromptTemplatePatch(id, input);
}

export async function updateCustomPromptTemplatePatch(id: string, input: PromptTemplatePatch): Promise<PromptTemplate[]> {
  const templates = await getCustomPromptTemplates();
  const index = templates.findIndex((template) => template.id === id);
  if (index === -1) {
    return templates;
  }

  const current = templates[index];
  templates[index] = {
    ...current,
    title: input.title === undefined ? current.title : input.title.trim(),
    category: input.category === undefined ? current.category : normalizeCategory(input.category),
    body: input.body === undefined ? current.body : input.body.trim(),
    favorite: input.favorite ?? current.favorite,
    updatedAt: Date.now()
  };
  return saveCustomPromptTemplates(templates);
}

export async function deleteCustomPromptTemplate(id: string): Promise<PromptTemplate[]> {
  return saveCustomPromptTemplates((await getCustomPromptTemplates()).filter((template) => template.id !== id));
}

export function normalizeCustomPromptTemplates(value: unknown): PromptTemplate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeCustomPromptTemplate)
    .filter((template): template is PromptTemplate => template !== null);
}

function normalizeCustomPromptTemplate(value: unknown): PromptTemplate | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<PromptTemplate>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const body = typeof candidate.body === "string" ? candidate.body.trim() : "";
  if (!title || !body) {
    return null;
  }

  const id = typeof candidate.id === "string" && candidate.id.startsWith(CUSTOM_PROMPT_ID_PREFIX)
    ? candidate.id
    : `${CUSTOM_PROMPT_ID_PREFIX}${crypto.randomUUID()}`;
  const createdAt = typeof candidate.createdAt === "number" ? candidate.createdAt : Date.now();
  const updatedAt = typeof candidate.updatedAt === "number" ? candidate.updatedAt : createdAt;

  return {
    id,
    title,
    category: normalizeCategory(candidate.category),
    body,
    favorite: typeof candidate.favorite === "boolean" ? candidate.favorite : true,
    createdAt,
    updatedAt
  };
}

function normalizeCategory(category: unknown): string {
  return typeof category === "string" && category.trim() ? category.trim() : "カスタム";
}
