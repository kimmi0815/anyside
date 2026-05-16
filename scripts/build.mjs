import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const srcDir = join(root, "src");
const distDir = join(root, "dist");
const CONTENT_SCRIPT_ENTRY = "content/aiInputAgent.js";
const BACKGROUND_ENTRY = "background/service-worker.js";

async function collectTypescriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTypescriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      files.push(path);
    }
  }

  return files;
}

async function stripTypesBuild(options = {}) {
  const { stripTypeScriptTypes } = await import("node:module");
  await rm(distDir, { recursive: true, force: true });

  const files = await collectTypescriptFiles(srcDir);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const js = stripTypeScriptTypes(source, { mode: "transform" });
    const cleanedJs = js.replace(/[ \t]+$/gm, "");
    const outFile = join(distDir, relative(srcDir, file)).replace(/\.ts$/, ".js");
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, `${cleanedJs}\n`);
  }

  await bundleClassicScript(CONTENT_SCRIPT_ENTRY, {
    label: "content script"
  });
  await bundleClassicScript(BACKGROUND_ENTRY, {
    label: "background service worker",
    keepTestingHooks: options.keepTestingHooks,
    footer: options.keepTestingHooks ? "globalThis.__anysideBackgroundTesting = __testing;" : undefined
  });
  console.log(`Built ${files.length} TypeScript files into dist/.`);
}

async function bundleClassicScript(entry, options) {
  const moduleFiles = await collectModuleGraph(join(distDir, entry));
  const chunks = [];
  for (const modulePath of moduleFiles) {
    const source = await readFile(modulePath, "utf8");
    chunks.push({
      modulePath: relative(distDir, modulePath),
      source: stripModuleSyntax(source, modulePath, {
        keepTestingHooks: options.keepTestingHooks === true
      })
    });
  }

  const bundled = [
    "(() => {",
    "  \"use strict\";",
    ...chunks.map(({ modulePath, source }) => [
      `\n  /* ${modulePath} */`,
      indent(source.trim())
    ].join("\n")),
    options.footer ? indent(`\n${options.footer}`) : "",
    "})();",
    ""
  ].join("\n");

  await writeFile(join(distDir, entry), bundled);
  console.log(`Bundled dist/${entry} for classic ${options.label} execution.`);
}

async function collectModuleGraph(entryPath, seen = new Set(), ordered = []) {
  const modulePath = resolve(entryPath);
  if (seen.has(modulePath)) {
    return ordered;
  }

  seen.add(modulePath);
  const source = await readFile(modulePath, "utf8");
  for (const specifier of collectImportSpecifiers(source, modulePath)) {
    await collectModuleGraph(resolveImport(modulePath, specifier), seen, ordered);
  }

  ordered.push(modulePath);
  return ordered;
}

function collectImportSpecifiers(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const specifiers = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  }

  return specifiers;
}

function resolveImport(importer, specifier) {
  if (!specifier.startsWith(".")) {
    throw new Error(`Cannot bundle external import "${specifier}" from ${relative(distDir, importer)}`);
  }

  return resolve(dirname(importer), specifier);
}

function stripModuleSyntax(source, fileName, options = {}) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const removals = [];

  for (const statement of sourceFile.statements) {
    if (!options.keepTestingHooks && isTestingExportStatement(statement)) {
      removals.push([statement.getFullStart(), statement.end]);
      continue;
    }

    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
      removals.push([statement.getFullStart(), statement.end]);
      continue;
    }

    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
    for (const modifier of modifiers) {
      if (modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword) {
        removals.push([modifier.getStart(sourceFile), modifier.end]);
      }
    }
  }

  return applyRemovals(source, removals).replace(/[ \t]+$/gm, "");
}

function isTestingExportStatement(statement) {
  if (!ts.isVariableStatement(statement)) {
    return false;
  }

  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
  if (!modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
    return false;
  }

  return statement.declarationList.declarations.some((declaration) =>
    ts.isIdentifier(declaration.name) && declaration.name.text === "__testing"
  );
}

function applyRemovals(source, removals) {
  const sortedRemovals = [...removals].sort((a, b) => a[0] - b[0]);
  let output = "";
  let cursor = 0;

  for (const [start, end] of sortedRemovals) {
    output += source.slice(cursor, start);
    cursor = end;
  }

  return output + source.slice(cursor);
}

function indent(source) {
  return source
    .split("\n")
    .map((line) => line ? `  ${line}` : "")
    .join("\n");
}

const args = new Set(process.argv.slice(2));
const keepTestingHooks = args.has("--testing-hooks");
if (args.has("--bundle-content")) {
  await bundleClassicScript(CONTENT_SCRIPT_ENTRY, {
    label: "content script"
  });
  await bundleClassicScript(BACKGROUND_ENTRY, {
    label: "background service worker",
    keepTestingHooks,
    footer: keepTestingHooks ? "globalThis.__anysideBackgroundTesting = __testing;" : undefined
  });
} else if (args.has("--strip-types")) {
  await stripTypesBuild({ keepTestingHooks });
} else {
  throw new Error("Usage: node scripts/build.mjs --bundle-content [--testing-hooks] | --strip-types [--testing-hooks]");
}
