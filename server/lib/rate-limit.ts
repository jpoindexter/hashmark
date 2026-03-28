/**
 * Simple in-memory sliding window rate limiter for Hono routes.
 * Keyed by IP + route prefix. No external dependencies.
 */

import type { Context, Next } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Prune stale entries every 5 minutes so the Map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

export function check(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

/**
 * Hono middleware factory.
 * @param maxRequests  Max requests allowed per window
 * @param windowMs     Window length in milliseconds (default: 60 000)
 * @param prefix       Key prefix to namespace rate limit buckets (e.g. "chat", "run")
 */
export function rateLimitMiddleware(maxRequests: number, windowMs = 60_000, prefix = "route") {
  return async (c: Context, next: Next) => {
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "local";
    const key = `${prefix}:${ip}`;

    if (!check(key, maxRequests, windowMs)) {
      return c.json({ error: "too many requests" }, 429);
    }

    return next();
  };
}
