/**
 * Bearer token auth middleware for studio API routes.
 * Checks Authorization header or ?token= query param (for EventSource).
 */

import type { Context, Next } from "hono";

export function studioAuthMiddleware(token: string) {
  return async (c: Context, next: Next) => {
    // Allow health and info endpoints through without auth
    const path = c.req.path;
    if (path === "/api/health" || path === "/api/info") {
      return next();
    }

    // Check Authorization header first
    const authHeader = c.req.header("Authorization");
    if (authHeader === `Bearer ${token}`) {
      return next();
    }

    // Fallback: check ?token= query param (needed for EventSource which can't set headers)
    const queryToken = c.req.query("token");
    if (queryToken === token) {
      return next();
    }

    return c.json({ error: "unauthorized" }, 401);
  };
}
