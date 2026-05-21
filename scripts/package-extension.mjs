import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

export const RELEASE_INCLUDED_PATHS = [
  "manifest.json",
  "dist",
  "src/sidepanel/index.html",
  "src/sidepanel/sidepanel.css",
  "src/options/index.html",
  "src/options/options.css",
  "src/shared/tokens.css",
  "src/offscreen/clipboard.html",
  "rules",
  "assets",
  "README.md"
];

export const RELEASE_EXCLUDED_NAMES = new Set([
  ".DS_Store",
  ".claude",
  ".git",
  "__MACOSX",
  "_metadata",
  "node_modules"
]);

export async function packageExtension(root = process.cwd()) {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const releaseDir = join(root, "release");
  const stagingDir = join(releaseDir, "extension");
  const zipPath = join(releaseDir, `${packageJson.name}-${packageJson.version}.zip`);

  await rm(stagingDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await mkdir(stagingDir, { recursive: true });

  for (const relativePath of RELEASE_INCLUDED_PATHS) {
    await cp(join(root, relativePath), join(stagingDir, relativePath), {
      recursive: true,
      filter: (source) => !RELEASE_EXCLUDED_NAMES.has(basename(source))
    });
  }

  await zipDirectory(stagingDir, zipPath);
  await rm(stagingDir, { recursive: true, force: true });

  return zipPath;
}

if (isMainModule()) {
  const zipPath = await packageExtension();
  console.log(`Packaged ${zipPath}`);
}

export function zipDirectory(cwd, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("zip", ["-r", "-X", outputPath, "."], { cwd });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `zip exited with code ${code}`));
    });
  });
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
