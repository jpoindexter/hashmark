import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { resetDb } from "../db.js";
import { sessionsRoutes } from "../routes/sessions.js";
import { studioAuthMiddleware } from "../lib/auth-middleware.js";

const TOKEN = "test-token-sessions";

function makeApp(projectDir: string) {
  const app = new Hono();
  app.use("/api/*", studioAuthMiddleware(TOKEN));
  app.route("/api/sessions", sessionsRoutes(projectDir));
  return app;
}

function authed() {
  return { headers: { Authorization: `Bearer ${TOKEN}` } };
}

describe("sessions routes", () => {
  let tmpDir: string;
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    resetDb();
    tmpDir = mkdtempSync(join(tmpdir(), "hashmark-sessions-test-"));
    app = makeApp(tmpDir);
  });

  afterEach(() => {
    resetDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Auth enforcement ────────────────────────────────────────────────────────

  it("returns 401 for requests without a token", async () => {
    const res = await app.request("/api/sessions");
    expect(res.status).toBe(401);
  });

  it("returns 200 with a valid token", async () => {
    const res = await app.request("/api/sessions", authed());
    expect(res.status).toBe(200);
  });

  // ── GET /api/sessions ───────────────────────────────────────────────────────

  it("returns an empty session list on a fresh database", async () => {
    const res = await app.request("/api/sessions", authed());
    const body = await res.json() as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(0);
  });

  // ── POST /api/sessions ──────────────────────────────────────────────────────

  it("creates a session and returns 201 with the new session", async () => {
    const res = await app.request("/api/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "My Test Session" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { session: { id: string; title: string; status: string } };
    expect(body.session.title).toBe("My Test Session");
    expect(body.session.status).toBe("idle");
    expect(typeof body.session.id).toBe("string");
  });

  it("uses 'New Session' as default title when none is provided", async () => {
    const res = await app.request("/api/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await res.json() as { session: { title: string } };
    expect(body.session.title).toBe("New Session");
  });

  // ── GET /api/sessions/:id ───────────────────────────────────────────────────

  it("returns 404 for a non-existent session id", async () => {
    const res = await app.request("/api/sessions/does-not-exist", authed());
    expect(res.status).toBe(404);
  });

  it("returns the session with an empty messages array and hasMore=false", async () => {
    const created = await app.request("/api/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Detail Test" }),
    });
    const { session } = await created.json() as { session: { id: string } };

    const res = await app.request(`/api/sessions/${session.id}`, authed());
    expect(res.status).toBe(200);
    const body = await res.json() as { session: { id: string }; messages: unknown[]; hasMore: boolean };
    expect(body.session.id).toBe(session.id);
    expect(body.messages).toHaveLength(0);
    expect(body.hasMore).toBe(false);
  });

  it("paginates messages with ?limit and returns hasMore=false when all fit", async () => {
    const created = await app.request("/api/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Pagination Test" }),
    });
    const { session } = await created.json() as { session: { id: string } };

    const res = await app.request(`/api/sessions/${session.id}?limit=50`, authed());
    const body = await res.json() as { messages: unknown[]; hasMore: boolean };
    expect(body.hasMore).toBe(false);
  });

  it("returns 400 for an invalid before cursor", async () => {
    const created = await app.request("/api/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session } = await created.json() as { session: { id: string } };

    const res = await app.request(
      `/api/sessions/${session.id}?limit=10&before=nonexistent-id`,
      authed()
    );
    expect(res.status).toBe(400);
  });

  // ── PATCH /api/sessions/:id ─────────────────────────────────────────────────

  it("updates the session title", async () => {
    const created = await app.request("/api/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Old Title" }),
    });
    const { session } = await created.json() as { session: { id: string } };

    const patched = await app.request(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title" }),
    });
    expect(patched.status).toBe(200);
    const body = await patched.json() as { session: { title: string } };
    expect(body.session.title).toBe("New Title");
  });

  it("archives a session", async () => {
    const created = await app.request("/api/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session } = await created.json() as { session: { id: string } };

    await app.request(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });

    // Archived session should not appear in the default (non-archived) list
    const listRes = await app.request("/api/sessions", authed());
    const { sessions } = await listRes.json() as { sessions: Array<{ id: string }> };
    expect(sessions.find((s) => s.id === session.id)).toBeUndefined();

    // It should appear when ?archived=true
    const archivedRes = await app.request("/api/sessions?archived=true", authed());
    const archivedBody = await archivedRes.json() as { sessions: Array<{ id: string }> };
    expect(archivedBody.sessions.find((s) => s.id === session.id)).toBeDefined();
  });

  // ── DELETE /api/sessions/:id ────────────────────────────────────────────────

  it("deletes a session", async () => {
    const created = await app.request("/api/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session } = await created.json() as { session: { id: string } };

    const del = await app.request(`/api/sessions/${session.id}`, {
      method: "DELETE",
      ...authed(),
    });
    expect(del.status).toBe(200);

    // Should now return 404
    const get = await app.request(`/api/sessions/${session.id}`, authed());
    expect(get.status).toBe(404);
  });

  // ── GET /api/sessions/search ────────────────────────────────────────────────

  it("returns empty results for a short query", async () => {
    const res = await app.request("/api/sessions/search?q=a", authed());
    expect(res.status).toBe(200);
    const body = await res.json() as { results: unknown[] };
    expect(body.results).toHaveLength(0);
  });

  it("returns results array for a valid query (even if empty DB)", async () => {
    const res = await app.request("/api/sessions/search?q=hello+world", authed());
    expect(res.status).toBe(200);
    const body = await res.json() as { results: unknown[] };
    expect(Array.isArray(body.results)).toBe(true);
  });
});
