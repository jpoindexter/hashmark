import { timingSafeEqual } from "crypto";
import type { Context, Next } from "hono";

/**
 * Timing-safe string comparison. Pads both buffers to the same length so
 * timingSafeEqual never throws, then also checks the raw lengths to prevent
 * false positives on strings of different lengths.
 * OWASP Authentication Cheat Sheet — compare credentials with constant-time
 * equality to prevent timing oracles.
 */
function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  const maxLen = Math.max(aBuf.length, bBuf.length);
  const aPadded = Buffer.alloc(maxLen);
  const bPadded = Buffer.alloc(maxLen);
  aBuf.copy(aPadded);
  bBuf.copy(bPadded);
  return timingSafeEqual(aPadded, bPadded) && aBuf.length === bBuf.length;
}

export function authMiddleware(token: string) {
  return async (c: Context, next: Next) => {
    const path = c.req.path;
    if (path === "/api/health" || path === "/api/info" || path === "/api/token") return next();

    const authHeader = c.req.header("Authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const queryToken = c.req.query("token");

    const provided = bearer ?? queryToken;
    if (provided !== null && provided !== undefined && safeCompare(provided, token)) return next();
    return c.json({ error: "unauthorized" }, 401);
  };
}
