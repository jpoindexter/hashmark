#!/usr/bin/env node
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const PROJECT_DIR = process.env.HASHMARK_PROJECT_DIR ?? process.cwd();

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  try {
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

loadEnvFile(join(PROJECT_DIR, ".env.local"));
loadEnvFile(join(PROJECT_DIR, ".env"));

// Import server (it calls serve() on load)
await import("./server/index.js");

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT",  () => process.exit(0));
process.on("unhandledRejection", (err) => console.error("[studio] unhandled rejection:", err));
process.on("uncaughtException",  (err) => { console.error("[studio] uncaught exception:", err); process.exit(1); });
