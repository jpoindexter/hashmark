#!/usr/bin/env node
/**
 * Bump version across package.json, Cargo.toml, and tauri.conf.json.
 * Usage: node scripts/bump-version.mjs [patch|minor|major|x.y.z] [--tag]
 */

import { readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const FILES = {
  "package.json": {
    path: resolve(root, "package.json"),
    pattern: /"version":\s*"[^"]+"/,
    replace: (v) => `"version": "${v}"`,
  },
  "Cargo.toml": {
    path: resolve(root, "src-tauri/Cargo.toml"),
    pattern: /^version\s*=\s*"[^"]+"/m,
    replace: (v) => `version = "${v}"`,
  },
  "tauri.conf.json": {
    path: resolve(root, "src-tauri/tauri.conf.json"),
    pattern: /"version":\s*"[^"]+"/,
    replace: (v) => `"version": "${v}"`,
  },
};

function readCurrentVersion() {
  const pkg = JSON.parse(readFileSync(FILES["package.json"].path, "utf8"));
  return pkg.version;
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      return null;
  }
}

function isValidSemver(v) {
  return /^\d+\.\d+\.\d+$/.test(v);
}

// --- main ---

const args = process.argv.slice(2);
const shouldTag = args.includes("--tag");
const input = args.find((a) => a !== "--tag");

if (!input) {
  console.error("Usage: bump-version.mjs [patch|minor|major|x.y.z] [--tag]");
  process.exit(1);
}

const current = readCurrentVersion();
let next;

if (["patch", "minor", "major"].includes(input)) {
  next = bumpVersion(current, input);
} else if (isValidSemver(input)) {
  next = input;
} else {
  console.error(`Invalid argument: "${input}". Use patch, minor, major, or x.y.z`);
  process.exit(1);
}

if (next === current) {
  console.error(`Version is already ${current}`);
  process.exit(1);
}

console.log(`${current} -> ${next}\n`);

for (const [name, file] of Object.entries(FILES)) {
  const content = readFileSync(file.path, "utf8");
  const updated = content.replace(file.pattern, file.replace(next));

  if (updated === content) {
    console.error(`  WARNING: no version match in ${name}`);
    continue;
  }

  writeFileSync(file.path, updated);
  console.log(`  updated ${name}`);
}

if (shouldTag) {
  const tag = `v${next}`;
  execFileSync("git", ["tag", tag], { cwd: root, stdio: "inherit" });
  console.log(`\n  created tag ${tag}`);
}

console.log("\ndone.");
