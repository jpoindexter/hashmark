import type { Context, Next } from "hono";

export function authMiddleware(token: string) {
  return async (c: Context, next: Next) => {
    const path = c.req.path;
    if (path === "/api/health" || path === "/api/info" || path === "/api/token") return next();

    const authHeader = c.req.header("Authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const queryToken = c.req.query("token");

    if ((bearer ?? queryToken) === token) return next();
    return c.json({ error: "unauthorized" }, 401);
  };
}
