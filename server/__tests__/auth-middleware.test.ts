import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { studioAuthMiddleware } from "../lib/auth-middleware.js";

const TOKEN = "abc123testtoken";

function makeApp() {
  const app = new Hono();
  app.use("*", studioAuthMiddleware(TOKEN));
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/info", (c) => c.json({ info: true }));
  app.get("/api/data", (c) => c.json({ secret: true }));
  return app;
}

describe("studioAuthMiddleware", () => {
  const app = makeApp();

  it("passes /api/health through without a token", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("passes /api/info through without a token", async () => {
    const res = await app.request("/api/info");
    expect(res.status).toBe(200);
    const body = await res.json() as { info: boolean };
    expect(body.info).toBe(true);
  });

  it("allows a protected route with valid Bearer token", async () => {
    const res = await app.request("/api/data", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { secret: boolean };
    expect(body.secret).toBe(true);
  });

  it("allows a protected route with valid ?token= query param", async () => {
    const res = await app.request(`/api/data?token=${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it("returns 401 when no token is provided", async () => {
    const res = await app.request("/api/data");
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 for wrong Authorization header", async () => {
    const res = await app.request("/api/data", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for wrong ?token= query param", async () => {
    const res = await app.request("/api/data?token=wrong-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 when Bearer scheme is missing (bare token in header)", async () => {
    const res = await app.request("/api/data", {
      headers: { Authorization: TOKEN },
    });
    expect(res.status).toBe(401);
  });
});
