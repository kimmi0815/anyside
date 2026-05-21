export { aiServiceLabel, detectAIService } from "./aiService.js";
export { CONTEXT_ACTIONS, getContextActions, renderContextTemplate } from "./contextTemplate.js";
export {
  CONTEXT_SHELF_ITEM_TEXT_LIMIT,
  CONTEXT_SHELF_MAX_ITEMS,
  addContextShelfItem,
  clearContextShelfItems,
  createContextShelfItem,
  deleteContextShelfItem,
  formatContextShelfItems,
  normalizeContextShelfItems,
  removeContextShelfItem
} from "./contextShelf.js";
export type { ContextShelfItem, ContextShelfItemKind } from "./contextShelf.js";
export {
  PROMPT_DRAFT_TEXT_LIMIT,
  clearPromptDraft,
  markPromptDraftCopied,
  markPromptDraftInserted,
  normalizePromptDraft,
  promptDraftActionText,
  setPromptDraftTarget,
  updatePromptDraftText
} from "./promptDraft.js";
export type { PromptDraft } from "./promptDraft.js";
export { getPromptTemplate, PROMPT_TEMPLATES } from "./promptTemplates.js";
export { promptTemplateUsesPageText, renderPromptTemplate } from "./renderPromptTemplate.js";
