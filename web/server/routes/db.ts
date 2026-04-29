import { Hono } from "hono";
import { getDb } from "../db.js";

const SAFE_PREFIX = /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i;

export function registerDbRoutes(app: Hono, ctx: { dataDir: string }) {
  const { dataDir: DATA_DIR } = ctx;

  app.get("/api/db/tables", (c) => {
    const db = getDb(DATA_DIR);
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    return c.json({ tables: rows.map(r => r.name) });
  });

  app.post("/api/db/query", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { sql?: string };
    const sql = (body.sql ?? "").trim();

    if (!sql) return c.json({ error: "sql required" }, 400);
    if (!SAFE_PREFIX.test(sql)) return c.json({ error: "only SELECT, PRAGMA, and EXPLAIN queries are allowed" }, 400);

    try {
      const db = getDb(DATA_DIR);
      const stmt = db.prepare(sql);
      const rows = stmt.all() as Record<string, unknown>[];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return c.json({ columns, rows: rows.map(r => columns.map(col => r[col])) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
