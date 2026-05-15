import type { AIInputAdapter, AIInputInsertResult, AIService } from "../types.js";

const GENERIC_INPUT_SELECTORS = [
  "#prompt-textarea",
  "[data-testid='prompt-textarea']",
  "[aria-label*='ChatGPT' i]",
  "[aria-label*='prompt' i]",
  "[aria-label*='message' i]",
  "[aria-label*='入力' i]",
  "[aria-label*='メッセージ' i]",
  "form [contenteditable='true']",
  "form div[role='textbox']",
  "textarea",
  "[contenteditable='true']",
  "div[role='textbox']",
  "[data-lexical-editor='true']",
  ".ProseMirror"
];

type EditableElement = HTMLTextAreaElement | HTMLElement;

export class GenericContentEditableAdapter implements AIInputAdapter {
  readonly service: AIService = "unknown";

  canHandle(): boolean {
    return true;
  }

  async insertText(text: string): Promise<AIInputInsertResult> {
    const input = findVisibleInput(GENERIC_INPUT_SELECTORS);
    if (!input) {
      return { success: false, reason: "no-input" };
    }

    return insertIntoElement(input, text)
      ? { success: true, reason: "inserted" }
      : { success: false, reason: "insert-failed" };
  }
}

export function findVisibleInput(selectors: string[]): EditableElement | null {
  const activeElement = document.activeElement;
  if (activeElement && isEditableElement(activeElement) && isVisible(activeElement)) {
    return activeElement;
  }

  for (const selector of selectors) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (isEditableElement(element) && isVisible(element)) {
        return element;
      }
    }
  }

  return null;
}

export function insertIntoElement(element: EditableElement, text: string): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return insertIntoTextarea(element, text);
  }

  const editable = resolveEditableElement(element);
  if (!editable) {
    return false;
  }

  const before = editable.textContent || "";
  editable.focus();
  placeCaretAtEnd(editable);
  dispatchBeforeInput(editable, text);
  const inserted = document.execCommand("insertText", false, text);
  dispatchInput(editable, text);
  if (inserted && hasInsertedText(editable, before, text)) {
    dispatchChange(editable);
    return true;
  }

  if (hasInsertedText(editable, before, text)) {
    dispatchChange(editable);
    return true;
  }

  insertWithRange(editable, text);
  dispatchInput(editable, text);
  dispatchChange(editable);
  return hasInsertedText(editable, before, text);
}

function insertIntoTextarea(textarea: HTMLTextAreaElement, text: string): boolean {
  const before = textarea.value;
  textarea.focus();

  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const nextValue = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;

  valueSetter?.call(textarea, nextValue);
  textarea.setSelectionRange(start + text.length, start + text.length);
  dispatchBeforeInput(textarea, text);
  dispatchInput(textarea, text);
  dispatchChange(textarea);
  return textarea.value === nextValue && textarea.value !== before;
}

function resolveEditableElement(element: Element): HTMLElement | null {
  if (element instanceof HTMLElement && (element.isContentEditable || element.getAttribute("contenteditable") === "true")) {
    return element;
  }

  const editableParent = element.closest("[contenteditable='true'], [data-lexical-editor='true'], .ProseMirror, div[role='textbox']");
  return editableParent instanceof HTMLElement ? editableParent : null;
}

function isEditableElement(element: Element): element is EditableElement {
  return element instanceof HTMLTextAreaElement || resolveEditableElement(element) !== null;
}

function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 100 && rect.height > 20 && style.visibility !== "hidden" && style.display !== "none";
}

function dispatchInput(element: Element, text: string): void {
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}

function dispatchBeforeInput(element: Element, text: string): void {
  element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: text }));
}

function dispatchChange(element: Element): void {
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function hasInsertedText(element: HTMLElement, before: string, text: string): boolean {
  const after = element.textContent || "";
  return after !== before && after.includes(text);
}

function placeCaretAtEnd(element: HTMLElement): void {
  const selection = document.getSelection?.();
  const range = document.createRange?.();
  if (!selection || !range) {
    return;
  }

  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertWithRange(element: HTMLElement, text: string): void {
  const selection = document.getSelection?.();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : document.createRange?.();
  if (!range) {
    element.textContent = `${element.textContent || ""}${text}`;
    return;
  }

  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection?.removeAllRanges();
  selection?.addRange(range);
}
