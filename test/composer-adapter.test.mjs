import assert from "node:assert/strict";
import { test } from "node:test";

import { GenericContentEditableAdapter } from "../dist/features/composer/adapters/generic.js";

test("generic adapter inserts into a contenteditable input", async () => {
  const dom = installFakeDom([
    new FakeElement("editor", { contenteditable: "true" }, "")
  ]);

  const result = await new GenericContentEditableAdapter().insertText("Hello editor");

  assert.deepEqual(result, { success: true, reason: "inserted" });
  assert.equal(dom.elements[0].textContent, "Hello editor");
  restoreFakeDom();
});

test("generic adapter inserts into a role textbox input", async () => {
  const dom = installFakeDom([
    new FakeElement("box", { role: "textbox" }, "")
  ]);

  const result = await new GenericContentEditableAdapter().insertText("Hello textbox");

  assert.deepEqual(result, { success: true, reason: "inserted" });
  assert.equal(dom.elements[0].textContent, "Hello textbox");
  restoreFakeDom();
});

test("generic adapter prioritizes ChatGPT prompt textarea", async () => {
  const other = new FakeElement("other", { contenteditable: "true" }, "");
  const prompt = new FakeElement("prompt-textarea", { contenteditable: "true", "aria-label": "ChatGPT とチャットする" }, "");
  const dom = installFakeDom([other, prompt]);

  const result = await new GenericContentEditableAdapter().insertText("Hello ChatGPT");

  assert.deepEqual(result, { success: true, reason: "inserted" });
  assert.equal(prompt.textContent, "Hello ChatGPT");
  assert.equal(other.textContent, "");
  assert.equal(dom.activeElement, prompt);
  restoreFakeDom();
});

const originalGlobals = new Map();

function installFakeDom(elements) {
  const document = new FakeDocument(elements);
  const window = {
    getComputedStyle: () => ({ display: "block", visibility: "visible" })
  };

  setGlobal("document", document);
  setGlobal("window", window);
  setGlobal("HTMLElement", FakeElement);
  setGlobal("HTMLTextAreaElement", FakeTextarea);
  setGlobal("InputEvent", FakeEvent);
  setGlobal("Event", FakeEvent);
  return document;
}

function restoreFakeDom() {
  for (const [key, value] of originalGlobals) {
    if (value === undefined) {
      delete globalThis[key];
    } else {
      globalThis[key] = value;
    }
  }
  originalGlobals.clear();
}

function setGlobal(key, value) {
  if (!originalGlobals.has(key)) {
    originalGlobals.set(key, globalThis[key]);
  }
  globalThis[key] = value;
}

class FakeDocument {
  activeElement = null;
  selection = new FakeSelection();

  constructor(elements) {
    this.elements = elements;
    for (const element of elements) {
      element.ownerDocument = this;
    }
  }

  querySelectorAll(selector) {
    return this.elements.filter((element) => element.matches(selector));
  }

  execCommand(command, _showDefaultUi, value) {
    if (command !== "insertText" || !this.activeElement) {
      return false;
    }
    this.activeElement.textContent = `${this.activeElement.textContent || ""}${value}`;
    return true;
  }

  getSelection() {
    return this.selection;
  }

  createRange() {
    return new FakeRange();
  }

  createTextNode(text) {
    return { textContent: text };
  }
}

class FakeElement {
  ownerDocument = null;
  parentElement = null;
  textContent = "";
  events = [];

  constructor(id, attrs = {}, textContent = "") {
    this.id = id;
    this.attrs = attrs;
    this.textContent = textContent;
  }

  get isContentEditable() {
    return this.attrs.contenteditable === "true";
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  closest(selector) {
    return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  dispatchEvent(event) {
    this.events.push(event.type);
    return true;
  }

  getBoundingClientRect() {
    return { width: 280, height: 44 };
  }

  matches(selector) {
    if (selector.includes(",")) {
      return selector.split(",").some((part) => this.matches(part.trim()));
    }
    if (selector === "#prompt-textarea") {
      return this.id === "prompt-textarea";
    }
    if (selector === "textarea") {
      return this instanceof FakeTextarea;
    }
    if (selector.includes("role='textbox'") || selector.includes('role="textbox"')) {
      return this.attrs.role === "textbox";
    }
    if (selector.includes("[contenteditable='true']")) {
      return this.attrs.contenteditable === "true";
    }
    if (selector.includes("[aria-label")) {
      const label = String(this.attrs["aria-label"] || "").toLowerCase();
      return label.includes("chatgpt") || label.includes("prompt") || label.includes("message") || label.includes("入力") || label.includes("メッセージ");
    }
    return false;
  }
}

class FakeTextarea extends FakeElement {
  value = "";
  selectionStart = 0;
  selectionEnd = 0;

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

class FakeSelection {
  rangeCount = 0;

  removeAllRanges() {
    this.rangeCount = 0;
  }

  addRange(range) {
    this.range = range;
    this.rangeCount = 1;
  }

  getRangeAt() {
    return this.range;
  }
}

class FakeRange {
  selectNodeContents(element) {
    this.element = element;
  }

  collapse() {}

  deleteContents() {}

  insertNode(node) {
    if (this.element) {
      this.element.textContent = `${this.element.textContent || ""}${node.textContent || ""}`;
    }
  }

  setStartAfter() {}

  setEndAfter() {}
}
