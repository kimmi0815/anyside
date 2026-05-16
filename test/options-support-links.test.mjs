import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const OPTIONS_HTML = new URL("../src/options/index.html", import.meta.url);

test("options page exposes support links with safe external-link attributes", async () => {
  const html = await readFile(OPTIONS_HTML, "utf8");

  assert.match(html, /href="#support"/);
  assert.match(html, /data-i18n="options.supportTitle"/);
  assert.match(html, /href="https:\/\/www\.buymeacoffee\.com\/kimmi0815" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/github\.com\/kimmi0815\/anyside\/issues\/new\?[^"]+" target="_blank" rel="noopener noreferrer"/);
});
