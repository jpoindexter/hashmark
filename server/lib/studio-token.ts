/**
 * Studio auth token -- generated once, persisted to disk.
 * Used as a Bearer token for all API requests.
 */

import { randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

let _cached: string | null = null;

export function getStudioToken(dataDir: string): string {
  if (_cached) return _cached;

  mkdirSync(dataDir, { recursive: true });
  const tokenPath = join(dataDir, "studio.token");

  if (existsSync(tokenPath)) {
    const existing = readFileSync(tokenPath, "utf-8").trim();
    if (existing) {
      _cached = existing;
      return _cached;
    }
  }

  const token = randomBytes(32).toString("hex");
  writeFileSync(tokenPath, token, { mode: 0o600 });
  _cached = token;
  return _cached;
}
