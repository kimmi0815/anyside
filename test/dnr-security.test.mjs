import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { FRAME_COMPATIBILITY_DOMAINS } from "../dist/shared/presets.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("DNR compatibility ruleset is packaged disabled by default", async () => {
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  const ruleset = manifest.declarative_net_request.rule_resources.find(
    (resource) => resource.id === "allow_framing_ai_sites"
  );

  assert.equal(ruleset.enabled, false);
});

test("DNR compatibility rule does not remove report-only CSP headers", async () => {
  const rules = JSON.parse(await readFile(join(root, "rules/allow-framing-ai-sites.json"), "utf8"));
  const removedHeaders = rules.flatMap((rule) =>
    rule.action.responseHeaders
      .filter((headerAction) => headerAction.operation === "remove")
      .map((headerAction) => headerAction.header.toLowerCase())
  );

  assert.deepEqual(removedHeaders.sort(), ["content-security-policy", "x-frame-options"]);
});

test("DNR compatibility request domains match built-in frame compatibility domains", async () => {
  const rules = JSON.parse(await readFile(join(root, "rules/allow-framing-ai-sites.json"), "utf8"));
  const requestDomains = rules.flatMap((rule) => rule.condition.requestDomains ?? []);

  assert.deepEqual([...requestDomains].sort(), [...FRAME_COMPATIBILITY_DOMAINS].sort());
  assert.equal(requestDomains.includes("keep.google.com"), false);
  assert.equal(requestDomains.includes("www.perplexity.ai"), true);
});
