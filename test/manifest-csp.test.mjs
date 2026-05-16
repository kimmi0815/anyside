import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function loadCspDirectives() {
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  const policy = manifest.content_security_policy?.extension_pages ?? "";
  const directives = new Map();
  for (const part of policy.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    directives.set(name.toLowerCase(), values);
  }
  return { policy, directives };
}

test("extension_pages CSP declares hardening directives", async () => {
  const { directives } = await loadCspDirectives();
  for (const name of ["default-src", "script-src", "object-src", "style-src", "base-uri", "form-action"]) {
    assert.ok(directives.has(name), `expected CSP directive ${name}`);
  }
});

test("extension_pages CSP base-uri and form-action are 'self'", async () => {
  const { directives } = await loadCspDirectives();
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  assert.deepEqual(directives.get("form-action"), ["'self'"]);
});

test("extension_pages CSP script-src and object-src are 'self' only", async () => {
  const { directives } = await loadCspDirectives();
  assert.deepEqual(directives.get("script-src"), ["'self'"]);
  assert.deepEqual(directives.get("object-src"), ["'self'"]);
});

test("extension_pages CSP style-src is 'self' only", async () => {
  const { directives } = await loadCspDirectives();
  assert.deepEqual(directives.get("style-src"), ["'self'"]);
});

test("extension_pages CSP does not allow remote or inline scripts", async () => {
  const { directives } = await loadCspDirectives();
  const scriptSources = directives.get("script-src") ?? [];
  assert.deepEqual(scriptSources, ["'self'"]);
  assertNoRemoteOrInlineSources(scriptSources);
});

test("extension_pages CSP does not allow remote styles or inline styles", async () => {
  const { directives } = await loadCspDirectives();
  const styleSources = directives.get("style-src") ?? [];
  assert.deepEqual(styleSources, ["'self'"]);
  assertNoRemoteOrInlineSources(styleSources);
});

test("extension_pages CSP connect-src restricts to self, https, and localhost only", async () => {
  const { directives } = await loadCspDirectives();
  const values = directives.get("connect-src") ?? [];
  assert.ok(values.includes("'self'"), "connect-src must include 'self'");
  assert.ok(values.includes("https:"), "connect-src must include https:");
  assert.ok(values.some((value) => value === "http://localhost:*"), "connect-src must include http://localhost:*");
  assert.ok(values.some((value) => value === "http://127.0.0.1:*"), "connect-src must include http://127.0.0.1:*");
  for (const value of values) {
    if (value === "'self'" || value === "https:") continue;
    assert.ok(
      value === "http://localhost:*" || value === "http://127.0.0.1:*",
      `unexpected connect-src value: ${value}`
    );
  }
});

test("extension_pages CSP does not enable unsafe-inline or unsafe-eval", async () => {
  const { policy } = await loadCspDirectives();
  assert.doesNotMatch(policy, /unsafe-inline/);
  assert.doesNotMatch(policy, /unsafe-eval/);
});

function assertNoRemoteOrInlineSources(values) {
  for (const value of values) {
    assert.doesNotMatch(value, /^[a-z][a-z0-9+.-]*:/i, `${value} must not be a remote source`);
    assert.notEqual(value, "*");
    assert.notEqual(value, "'unsafe-inline'");
    assert.doesNotMatch(value, /^'nonce-/);
    assert.doesNotMatch(value, /^'sha(256|384|512)-/);
  }
}
