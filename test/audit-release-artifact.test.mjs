import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { auditReleaseArtifact } from "../scripts/audit-release-artifact.mjs";
import { zipDirectory } from "../scripts/package-extension.mjs";

test("release artifact audit accepts release-shaped zip with allowlisted sinks", async (t) => {
  const { stagingDir, zipPath } = await createZipFixture(t);
  await writeFixtureFile(stagingDir, "manifest.json", "{}\n");
  await writeFixtureFile(
    stagingDir,
    "dist/background/service-worker.js",
    "chrome.scripting.executeScript({ func: () => navigator.clipboard.writeText('copy') });\n"
  );
  await writeFixtureFile(
    stagingDir,
    "dist/options/main.js",
    "new DOMParser().parseFromString('<html></html>', 'text/html');\n"
  );
  await writeFixtureFile(
    stagingDir,
    "dist/offscreen/clipboard.js",
    "navigator.clipboard.writeText('copy');\n"
  );
  await writeFixtureFile(
    stagingDir,
    "dist/sidepanel/main.js",
    "navigator.clipboard.writeText('copy');\n"
  );
  await writeFixtureFile(
    stagingDir,
    "src/options/index.html",
    '<script type="module" src="../../dist/options/main.js"></script>\n'
  );

  await zipDirectory(stagingDir, zipPath);

  const result = await auditReleaseArtifact(zipPath);
  assert.equal(result.ok, true);
});

test("release artifact audit rejects forbidden archive contents and unsafe code", async (t) => {
  const { stagingDir, zipPath } = await createZipFixture(t);
  await writeFixtureFile(stagingDir, "manifest.json", "{}\n");
  await writeFixtureFile(stagingDir, ".git/config", "[core]\n");
  await writeFixtureFile(stagingDir, "nested.zip", "not a real nested archive\n");
  await writeFixtureFile(stagingDir, "package-lock.json", "{}\n");
  await writeFixtureFile(stagingDir, "src/background/service-worker.ts", "export const leak = true;\n");
  await writeFixtureFile(stagingDir, "coverage/index.html", "<p>coverage</p>\n");
  await writeFixtureFile(
    stagingDir,
    "dist/background/service-worker.js",
    [
      "const __testing = {};",
      "globalThis.__anysideBackgroundTesting = __testing;",
      "importScripts('https://cdn.example.test/remote.js');",
      "eval('1 + 1');",
      "new Function('return 1');",
      "document.body.innerHTML = '<img>';"
    ].join("\n")
  );

  await zipDirectory(stagingDir, zipPath);

  const result = await auditReleaseArtifact(zipPath, { throwOnFailure: false });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes(".git")));
  assert.ok(result.errors.some((error) => error.includes("nested zip")));
  assert.ok(result.errors.some((error) => error.includes("package-lock")));
  assert.ok(result.errors.some((error) => error.includes("source")));
  assert.ok(result.errors.some((error) => error.includes("coverage")));
  assert.ok(result.errors.some((error) => error.includes("__testing")));
  assert.ok(result.errors.some((error) => error.includes("global background test hook")));
  assert.ok(result.errors.some((error) => error.includes("remote script")));
  assert.ok(result.errors.some((error) => error.includes("eval")));
  assert.ok(result.errors.some((error) => error.includes("new Function")));
  assert.ok(result.errors.some((error) => error.includes("innerHTML")));
});

test("release artifact audit rejects a stale manifest version when expected", async (t) => {
  const { stagingDir, zipPath } = await createZipFixture(t);
  await writeFixtureFile(stagingDir, "manifest.json", JSON.stringify({ version: "0.1.0" }));

  await zipDirectory(stagingDir, zipPath);

  const result = await auditReleaseArtifact(zipPath, { expectedVersion: "0.2.0", throwOnFailure: false });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("does not match package version 0.2.0")));
});

async function createZipFixture(t) {
  const tempRoot = await mkdtemp(join(tmpdir(), "anyside-audit-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  return {
    stagingDir: join(tempRoot, "extension"),
    zipPath: join(tempRoot, "extension.zip")
  };
}

async function writeFixtureFile(root, relativePath, contents) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}
