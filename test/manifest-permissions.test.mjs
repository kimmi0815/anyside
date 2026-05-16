import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const checklistPath = join(root, "docs/chrome-web-store-checklist.md");

async function loadManifest() {
  return JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
}

async function loadChecklist() {
  return readFile(checklistPath, "utf8");
}

test("manifest permissions match the public Chrome Web Store checklist", async () => {
  const manifest = await loadManifest();
  const checklist = await loadChecklist();
  const documentedPermissions = documentedBullets(checklist, "Permission Justification");

  assert.deepEqual([...manifest.permissions].sort(), [...documentedPermissions].sort());
  for (const permission of documentedPermissions) {
    assert.match(checklist, new RegExp(`- \`${escapeRegExp(permission)}\`: .+`), `${permission} must be justified`);
  }
});

test("manifest does not request persistent tabs permission", async () => {
  const manifest = await loadManifest();

  assert.equal(manifest.permissions.includes("tabs"), false);
});

test("manifest host permissions match the public Chrome Web Store checklist", async () => {
  const manifest = await loadManifest();
  const checklist = await loadChecklist();
  const documentedHostPermissions = documentedBullets(checklist, "Host Permission Justification");

  assert.deepEqual([...manifest.host_permissions].sort(), [...documentedHostPermissions].sort());
  for (const hostPermission of documentedHostPermissions) {
    assert.match(
      checklist,
      new RegExp(`- \`${escapeRegExp(hostPermission)}\`: .+`),
      `${hostPermission} must be justified`
    );
  }
});

function documentedBullets(markdown, heading) {
  const section = markdown.match(new RegExp(`## ${escapeRegExp(heading)}\\n([\\s\\S]*?)(?:\\n## |$)`))?.[1] ?? "";
  const permissions = [...section.matchAll(/^- `([^`]+)`: .+$/gm)].map((match) => match[1]);

  assert.equal(new Set(permissions).size, permissions.length, `${heading} contains duplicate entries`);
  assert.ok(permissions.length > 0, `${heading} must document permissions`);
  return permissions;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
