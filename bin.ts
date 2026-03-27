#!/usr/bin/env node
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { createServer } from "./server/index.js";

const PROJECT_DIR = process.env.HASHMARK_PROJECT_DIR ?? process.cwd();
const PORT = parseInt(process.env.STUDIO_PORT ?? "3200", 10);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const STATIC_DIR = resolve(join(__dirname, "public"));

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(join(PROJECT_DIR, ".env.local"));
loadEnvFile(join(PROJECT_DIR, ".env"));

console.log(`[studio] starting on port ${PORT}, project: ${PROJECT_DIR}`);

createServer({ projectDir: PROJECT_DIR, staticDir: STATIC_DIR, port: PORT });
