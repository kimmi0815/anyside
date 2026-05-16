import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const FORBIDDEN_PATH_PARTS = new Set([
  ".DS_Store",
  ".claude",
  ".git",
  "__MACOSX",
  "_metadata",
  "node_modules"
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".map"]);
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".txt"]);

const DANGEROUS_SINKS = [
  {
    label: "DOMParser",
    pattern: /\bDOMParser\b/g,
    allow: (entry) => entry === "dist/options/main.js"
  },
  {
    label: "chrome.scripting.executeScript",
    pattern: /\bchrome\.scripting\.executeScript\s*\(/g,
    allow: (entry) => entry === "dist/background/service-worker.js"
  },
  {
    label: "navigator.clipboard.writeText",
    pattern: /\bnavigator\.clipboard\.writeText\s*\(/g,
    allow: (entry) => [
      "dist/background/service-worker.js",
      "dist/offscreen/clipboard.js",
      "dist/sidepanel/main.js"
    ].includes(entry)
  },
  {
    label: "innerHTML",
    pattern: /\.innerHTML\b/g,
    allow: () => false
  },
  {
    label: "outerHTML",
    pattern: /\.outerHTML\b/g,
    allow: () => false
  },
  {
    label: "insertAdjacentHTML",
    pattern: /\.insertAdjacentHTML\s*\(/g,
    allow: () => false
  },
  {
    label: "document.write",
    pattern: /\bdocument\.write\s*\(/g,
    allow: () => false
  },
  {
    label: "srcdoc",
    pattern: /\.srcdoc\b|\bsrcdoc\s*=/g,
    allow: () => false
  }
];

export class ReleaseArtifactAuditError extends Error {
  constructor(errors) {
    super(`Release artifact audit failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "ReleaseArtifactAuditError";
    this.errors = errors;
  }
}

export async function auditReleaseArtifact(zipPath, options = {}) {
  const entries = await listZipEntries(zipPath);
  const errors = [];

  if (!entries.includes("manifest.json")) {
    errors.push("manifest.json must be at the zip root");
  }

  for (const entry of entries) {
    auditEntryPath(entry, errors);
  }

  for (const entry of entries.filter(isTextEntry)) {
    const source = await readZipEntry(zipPath, entry);
    auditEntryContents(entry, source, errors);
  }

  if (errors.length > 0) {
    if (options.throwOnFailure === false) {
      return { ok: false, errors, entries };
    }
    throw new ReleaseArtifactAuditError(errors);
  }

  return { ok: true, errors: [], entries };
}

function auditEntryPath(entry, errors) {
  const parts = entry.split("/").filter(Boolean);
  for (const part of parts) {
    if (FORBIDDEN_PATH_PARTS.has(part)) {
      errors.push(`${entry} contains forbidden release path component ${part}`);
    }
  }

  if (entry.endsWith("/")) {
    return;
  }

  if (/\.zip$/i.test(entry)) {
    errors.push(`${entry} is a nested zip archive`);
  }

  if (/^tests?\//.test(entry) || /^coverage\//.test(entry)) {
    errors.push(`${entry} is development/test output and must not ship`);
  }

  if (entry === "package-lock.json" || entry.endsWith("/package-lock.json")) {
    errors.push(`${entry} is package-lock leakage`);
  }

  const extension = extname(entry).toLowerCase();
  if (SOURCE_EXTENSIONS.has(extension)) {
    errors.push(`${entry} is source or sourcemap leakage`);
  }

  if (entry.startsWith("src/") && !/\.(css|html)$/i.test(entry)) {
    errors.push(`${entry} is source leakage outside manifest-owned page assets`);
  }
}

function auditEntryContents(entry, source, errors) {
  if (entry === "dist/background/service-worker.js") {
    if (source.includes("__testing")) {
      errors.push(`${entry} contains production test hook name __testing`);
    }
    if (source.includes("globalThis.__anysideBackgroundTesting")) {
      errors.push(`${entry} contains production global background test hook`);
    }
  }

  const remoteScriptChecks = [
    /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//gi,
    /\bimportScripts\s*\(\s*["']https?:\/\//g,
    /\bimport\s*\(\s*["']https?:\/\//g,
    /^\s*import\b[^;]*\bfrom\s*["']https?:\/\//gm
  ];
  for (const pattern of remoteScriptChecks) {
    if (pattern.test(source)) {
      errors.push(`${entry} loads or imports remote script code`);
      break;
    }
  }

  if (/\beval\s*\(/.test(source)) {
    errors.push(`${entry} uses eval()`);
  }
  if (/\bnew\s+Function\s*\(/.test(source)) {
    errors.push(`${entry} uses new Function()`);
  }

  for (const sink of DANGEROUS_SINKS) {
    const matches = source.match(sink.pattern);
    if (matches && !sink.allow(entry, source)) {
      errors.push(`${entry} uses unallowlisted dangerous sink ${sink.label}`);
    }
  }
}

function isTextEntry(entry) {
  return TEXT_EXTENSIONS.has(extname(entry).toLowerCase());
}

export function defaultZipPath(root = process.cwd()) {
  return readFile(join(root, "package.json"), "utf8")
    .then((source) => {
      const packageJson = JSON.parse(source);
      return join(root, "release", `${packageJson.name}-${packageJson.version}.zip`);
    });
}

async function listZipEntries(zipPath) {
  const stdout = await runCommand("zipinfo", ["-1", zipPath]);
  return stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

async function readZipEntry(zipPath, entry) {
  return runCommand("unzip", ["-p", zipPath, entry]);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
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
        resolve(stdout);
        return;
      }

      reject(new Error(stderr || `${command} exited with code ${code}`));
    });
  });
}

if (isMainModule()) {
  const zipPath = process.argv[2] ?? await defaultZipPath();
  await auditReleaseArtifact(zipPath);
  console.log(`Audited ${zipPath}`);
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
