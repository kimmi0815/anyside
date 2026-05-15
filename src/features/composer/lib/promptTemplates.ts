import type { PromptTemplate } from "../types.js";

export const PROMPT_TEMPLATES: PromptTemplate[] = [];

export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((template) => template.id === id);
}
