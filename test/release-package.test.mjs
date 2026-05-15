import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { RELEASE_EXCLUDED_NAMES, RELEASE_INCLUDED_PATHS } from "../scripts/package-extension.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("release:zip runs typecheck and the standard build before packaging", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const releaseScript = packageJson.scripts["release:zip"];

  assert.match(releaseScript, /npm run typecheck/);
  assert.match(releaseScript, /npm run build/);
  assert.match(releaseScript, /node scripts\/package-extension\.mjs/);
});

test("package-extension does not import the local experimental build helper", async () => {
  const source = await readFile(join(root, "scripts/package-extension.mjs"), "utf8");

  assert.doesNotMatch(source, /build\.mjs/);
});

test("release manifest covers local paths referenced by manifest.json", async () => {
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  const referencedPaths = collectManifestPaths(manifest);

  for (const referencedPath of referencedPaths) {
    assert.ok(isReleaseIncluded(referencedPath), `${referencedPath} should be included in the release zip`);
  }
});

test("release packaging excludes generated metadata and development-only folders", () => {
  for (const excludedName of [".DS_Store", ".git", "__MACOSX", "_metadata", "node_modules"]) {
    assert.ok(RELEASE_EXCLUDED_NAMES.has(excludedName), `${excludedName} should be excluded`);
  }
});

function collectManifestPaths(manifest) {
  const paths = new Set();
  addPath(paths, manifest.background?.service_worker);
  addPath(paths, manifest.side_panel?.default_path);
  addPath(paths, manifest.options_page);

  for (const iconPath of Object.values(manifest.icons ?? {})) {
    addPath(paths, iconPath);
  }

  for (const iconPath of Object.values(manifest.action?.default_icon ?? {})) {
    addPath(paths, iconPath);
  }

  for (const resource of manifest.declarative_net_request?.rule_resources ?? []) {
    addPath(paths, resource.path);
  }

  return [...paths].sort();
}

function addPath(paths, value) {
  if (typeof value === "string" && !value.includes("*") && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    paths.add(normalize(value));
  }
}

function isReleaseIncluded(referencedPath) {
  return RELEASE_INCLUDED_PATHS.some((includedPath) => {
    const normalizedIncludedPath = normalize(includedPath);
    return referencedPath === normalizedIncludedPath || referencedPath.startsWith(`${normalizedIncludedPath}/`);
  });
}
