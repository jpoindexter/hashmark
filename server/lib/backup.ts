/**
 * Hourly SQLite backup via better-sqlite3's backup() API
 * Falls back to copyFileSync if backup() is unavailable
 */

import { copyFileSync } from "fs";
import { join } from "path";
import { getDb } from "../db.js";

export function startDbBackup(dataDir: string) {
  const interval = setInterval(() => {
    try {
      const db = getDb(dataDir);
      const backupPath = join(dataDir, "studio.db.bak");

      if (typeof db.backup === "function") {
        db.backup(backupPath)
          .then(() => console.log("[backup] studio.db backed up"))
          .catch((err: Error) => console.error("[backup] failed:", err.message));
      } else {
        // Fallback: raw file copy (safe for WAL when DB is idle)
        copyFileSync(join(dataDir, "studio.db"), backupPath);
        console.log("[backup] studio.db backed up (copy)");
      }
    } catch {}
  }, 60 * 60_000); // every hour

  interval.unref();
}
