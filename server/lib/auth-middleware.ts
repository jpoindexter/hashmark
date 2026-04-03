/**
 * Bearer token auth middleware for studio API routes.
 * Checks Authorization header or ?token= query param (for EventSource).
 */

import type { Context, Next } from "hono";

export function studioAuthMiddleware(token: string) {
  return async (c: Context, next: Next) => {
    const path = c.req.path;
    if (path === "/api/health" || path === "/api/info") {
      return next();
    }

    const authHeader = c.req.header("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const queryToken = c.req.query("token");
    const providedToken = bearerToken ?? queryToken;

    if (providedToken === token) {
      return next();
    }

    return c.json({ error: "unauthorized" }, 401);
  };
}
