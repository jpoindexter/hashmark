import type { Context, Next } from "hono";

interface Entry { count: number; resetAt: number; }
const store = new Map<string, Entry>();
setInterval(() => { const now = Date.now(); for (const [k, e] of store) if (now > e.resetAt) store.delete(k); }, 300_000).unref();

export function rateLimitMiddleware(max: number, windowMs = 60_000, prefix = "route") {
  return async (c: Context, next: Next) => {
    const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
    const key = `${prefix}:${ip}`;
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || now > entry.resetAt) { store.set(key, { count: 1, resetAt: now + windowMs }); }
    else if (entry.count >= max) return c.json({ error: "too many requests" }, 429);
    else entry.count++;
    return next();
  };
}
