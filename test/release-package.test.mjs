import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { packageExtension, RELEASE_EXCLUDED_NAMES, RELEASE_INCLUDED_PATHS } from "../scripts/package-extension.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("release:zip runs typecheck and the standard build before packaging", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const releaseScript = packageJson.scripts["release:zip"];

  assert.match(releaseScript, /npm run typecheck/);
  assert.match(releaseScript, /npm run build/);
  assert.match(releaseScript, /node scripts\/package-extension\.mjs/);
});

test("standard build cleans dist before compiling and bundling content scripts", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const buildScript = packageJson.scripts.build;

  assert.match(buildScript, /npm run clean/);
  assert.match(buildScript, /tsc -p tsconfig\.json/);
  assert.match(buildScript, /node scripts\/build\.mjs --bundle-content/);
  assert.equal(await exists(join(root, "dist/features/composer/lib/detectAIService.js")), false);
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

test("manifest content scripts point to classic script artifacts", async () => {
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  const contentScriptPaths = manifest.content_scripts.flatMap((contentScript) => contentScript.js ?? []);

  assert.ok(contentScriptPaths.length > 0, "manifest should declare content script entries");
  for (const contentScriptPath of contentScriptPaths) {
    const source = await readFile(join(root, contentScriptPath), "utf8");
    assert.doesNotMatch(source, /^\s*import\s/m, `${contentScriptPath} should not include top-level imports`);
    assert.doesNotMatch(source, /^\s*export\s/m, `${contentScriptPath} should not include top-level exports`);
  }
});

test("clean build keeps stale dist artifacts out of release zip", async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), "anyside-release-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  await cp(join(root, "src"), join(tempRoot, "src"), { recursive: true });
  await cp(join(root, "assets"), join(tempRoot, "assets"), { recursive: true });
  await cp(join(root, "rules"), join(tempRoot, "rules"), { recursive: true });
  await cp(join(root, "manifest.json"), join(tempRoot, "manifest.json"));
  await cp(join(root, "tsconfig.json"), join(tempRoot, "tsconfig.json"));
  await cp(join(root, "README.md"), join(tempRoot, "README.md"));
  await writeFile(join(tempRoot, "package.json"), JSON.stringify({
    name: "anyside-release-test",
    version: "0.0.0"
  }));

  const staleArtifact = join(tempRoot, "dist/content/stale-artifact.js");
  await mkdir(dirname(staleArtifact), { recursive: true });
  await writeFile(staleArtifact, "throw new Error('stale');\n");

  await rm(join(tempRoot, "dist"), { recursive: true, force: true });
  await runCommand(process.execPath, [
    join(root, "node_modules/typescript/bin/tsc"),
    "-p",
    join(tempRoot, "tsconfig.json")
  ], { cwd: tempRoot });
  await runCommand(process.execPath, [join(root, "scripts/build.mjs"), "--bundle-content"], { cwd: tempRoot });

  assert.equal(await exists(staleArtifact), false, "clean build should remove stale dist artifacts");

  const zipPath = await packageExtension(tempRoot);
  const entries = (await runCommand("zipinfo", ["-1", zipPath])).trim().split("\n");

  assert.ok(!entries.some((entry) => entry.includes("stale-artifact")), "release zip should not contain stale artifacts");
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

  for (const contentScript of manifest.content_scripts ?? []) {
    for (const scriptPath of contentScript.js ?? []) {
      addPath(paths, scriptPath);
    }
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

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveCommand(stdout);
        return;
      }

      reject(new Error(stderr || `${command} exited with code ${code}`));
    });
  });
}
