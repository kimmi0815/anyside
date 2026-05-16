import assert from "node:assert/strict";
import { test } from "node:test";

let importCounter = 0;

test("OFFSCREEN_COPY_TEXT rejects content-script senders (sender.tab present)", async () => {
  const { listener, written } = await loadOffscreen();
  const response = await invoke(listener, {
    message: { type: "OFFSCREEN_COPY_TEXT", target: "offscreen", text: "hello" },
    sender: { id: "anyside", tab: { id: 1 } }
  });
  assert.deepEqual(response, { ok: false, error: "Forbidden." });
  assert.deepEqual(written, []);
});

test("OFFSCREEN_COPY_TEXT rejects foreign extension senders", async () => {
  const { listener, written } = await loadOffscreen();
  const response = await invoke(listener, {
    message: { type: "OFFSCREEN_COPY_TEXT", target: "offscreen", text: "hello" },
    sender: { id: "evil-extension" }
  });
  assert.deepEqual(response, { ok: false, error: "Forbidden." });
  assert.deepEqual(written, []);
});

test("OFFSCREEN_COPY_TEXT rejects non-string text", async () => {
  const { listener, written } = await loadOffscreen();
  const response = await invoke(listener, {
    message: { type: "OFFSCREEN_COPY_TEXT", target: "offscreen", text: 42 },
    sender: { id: "anyside" }
  });
  assert.deepEqual(response, { ok: false, error: "Invalid text." });
  assert.deepEqual(written, []);
});

test("OFFSCREEN_COPY_TEXT rejects oversized text", async () => {
  const { listener, written } = await loadOffscreen();
  const response = await invoke(listener, {
    message: { type: "OFFSCREEN_COPY_TEXT", target: "offscreen", text: "x".repeat(1_000_001) },
    sender: { id: "anyside" }
  });
  assert.deepEqual(response, { ok: false, error: "Text is too large." });
  assert.deepEqual(written, []);
});

test("OFFSCREEN_COPY_TEXT accepts background-origin string text", async () => {
  const { listener, written } = await loadOffscreen();
  const response = await invoke(listener, {
    message: { type: "OFFSCREEN_COPY_TEXT", target: "offscreen", text: "copied" },
    sender: { id: "anyside" }
  });
  assert.deepEqual(response, { ok: true });
  assert.deepEqual(written, ["copied"]);
});

test("OFFSCREEN_COPY_TEXT ignores messages with the wrong target", async () => {
  const { listener, written } = await loadOffscreen();
  const result = listenSync(listener, {
    message: { type: "OFFSCREEN_COPY_TEXT", target: "background", text: "copied" },
    sender: { id: "anyside" }
  });
  assert.equal(result.returned, false);
  assert.equal(result.response, undefined);
  assert.deepEqual(written, []);
});

test("OFFSCREEN_COPY_TEXT ignores messages with the wrong type", async () => {
  const { listener, written } = await loadOffscreen();
  const result = listenSync(listener, {
    message: { type: "OTHER", target: "offscreen", text: "copied" },
    sender: { id: "anyside" }
  });
  assert.equal(result.returned, false);
  assert.equal(result.response, undefined);
  assert.deepEqual(written, []);
});

async function loadOffscreen() {
  const written = [];
  let listener;
  globalThis.chrome = {
    runtime: {
      id: "anyside",
      onMessage: {
        addListener(fn) {
          listener = fn;
        }
      }
    }
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: {
      clipboard: {
        async writeText(text) {
          written.push(text);
        }
      }
    }
  });

  await import(`../dist/offscreen/clipboard.js?offscreen-${Date.now()}-${importCounter++}`);
  return { listener, written };
}

function invoke(listener, { message, sender }) {
  return new Promise((resolve) => {
    const returned = listener(message, sender, resolve);
    if (returned !== true) {
      resolve(undefined);
    }
  });
}

function listenSync(listener, { message, sender }) {
  let response;
  const returned = listener(message, sender, (value) => {
    response = value;
  });
  return { returned, response };
}
