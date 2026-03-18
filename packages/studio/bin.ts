#!/usr/bin/env node
/**
 * hashmark studio — entry point
 * `npx hashmark studio` → starts local server on port 3200, opens browser
 */

import { createServer } from "./server/index.js";
import open from "open";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";

const PORT = parseInt(process.env.STUDIO_PORT ?? "3200", 10);
const PROJECT_DIR = process.env.HASHMARK_PROJECT_DIR ?? process.cwd();

// Load .env.local / .env from project dir to pick up ANTHROPIC_API_KEY etc.
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}
loadEnvFile(`${PROJECT_DIR}/.env.local`);
loadEnvFile(`${PROJECT_DIR}/.env`);
const NO_OPEN = process.env.HASHMARK_NO_OPEN === "1";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const STATIC_DIR = resolve(__dirname, "public");

const { server } = createServer({ projectDir: PROJECT_DIR, staticDir: STATIC_DIR, port: PORT });

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  hashmark studio`);
  console.log(`  ──────────────────────────────`);
  console.log(`  Local:   ${url}`);
  console.log(`  Project: ${PROJECT_DIR}`);
  if (!NO_OPEN) {
    console.log(`\n  Opening browser...`);
    open(url);
  }
  console.log(`\n  Press Ctrl+C to stop\n`);
});
