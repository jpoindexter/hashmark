/**
 * Bearer token auth middleware for studio API routes.
 * Checks Authorization header or ?token= query param (for EventSource).
 * Also accepts bridge tokens for remote device access.
 */

import type { Context, Next } from "hono";

export type BridgeTokenValidator = (token: string) => boolean;

let _bridgeValidator: BridgeTokenValidator | null = null;

/** Register a bridge token validator (called once from server/index.ts) */
export function setBridgeTokenValidator(fn: BridgeTokenValidator): void {
  _bridgeValidator = fn;
}

export function studioAuthMiddleware(token: string) {
  return async (c: Context, next: Next) => {
    // Allow health and info endpoints through without auth
    const path = c.req.path;
    if (path === "/api/health" || path === "/api/info") {
      return next();
    }

    // Allow bridge pairing endpoint through -- pairing code is the auth
    if (path === "/api/bridge/pair") {
      return next();
    }

    // Extract token from header or query param
    const authHeader = c.req.header("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const queryToken = c.req.query("token");
    const providedToken = bearerToken ?? queryToken;

    // Check studio token (local access)
    if (providedToken === token) {
      return next();
    }

    // Check bridge token (remote access)
    if (providedToken && _bridgeValidator?.(providedToken)) {
      return next();
    }

    return c.json({ error: "unauthorized" }, 401);
  };
}
