import { Hono } from "hono";
import { randomUUID } from "crypto";
import { listWorkflows, saveWorkflow, deleteWorkflow, startWorkflowRun, getWorkflowRun, listWorkflowRuns, cancelWorkflowRun, BUILTIN_WORKFLOWS, installBuiltin } from "../workflow.js";
import { loadGitHubConfig, saveGitHubConfig } from "../github.js";

const pendingHumanGates = new Map<string, (approved: boolean) => void>();

export function registerWorkflowRoutes(app: Hono, ctx: { dataDir: string; projectDir: string }) {
  const { dataDir: DATA_DIR, projectDir: PROJECT_DIR } = ctx;

  // ── Workflows ─────────────────────────────────────────────────────────────────

  app.get("/api/workflows", (c) => c.json(listWorkflows(DATA_DIR)));
  app.get("/api/workflows/builtins", (c) => c.json(BUILTIN_WORKFLOWS.map((w, i) => ({ index: i, name: w.name, description: w.description }))));

  app.post("/api/workflows/builtins/:index/install", (c) => {
    const idx = parseInt(c.req.param("index"), 10);
    try { return c.json(installBuiltin(DATA_DIR, idx), 201); }
    catch (e) { return c.json({ error: String(e) }, 400); }
  });

  app.post("/api/workflows", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.name || !Array.isArray(body.steps)) return c.json({ error: "name and steps required" }, 400);
    const def = { id: randomUUID(), name: body.name, description: body.description ?? "", steps: body.steps, created_at: Date.now() };
    saveWorkflow(DATA_DIR, def);
    return c.json(def, 201);
  });

  app.patch("/api/workflows/:id", async (c) => {
    const workflows = listWorkflows(DATA_DIR);
    const existing = workflows.find(w => w.id === c.req.param("id"));
    if (!existing) return c.json({ error: "not found" }, 404);
    const body = await c.req.json().catch(() => ({}));
    const updated = { ...existing, ...body, id: existing.id, created_at: existing.created_at };
    saveWorkflow(DATA_DIR, updated);
    return c.json(updated);
  });

  app.delete("/api/workflows/:id", (c) => {
    deleteWorkflow(DATA_DIR, c.req.param("id"));
    return c.body(null, 204);
  });

  app.post("/api/workflows/:id/run", async (c) => {
    const run = await startWorkflowRun({
      workflowId: c.req.param("id"),
      dataDir: DATA_DIR,
      projectDir: PROJECT_DIR,
      onHumanGate: (runId, stepId) => new Promise<boolean>((resolve) => {
        const key = `${runId}:${stepId}`;
        pendingHumanGates.set(key, resolve);
        setTimeout(() => { if (pendingHumanGates.delete(key)) resolve(false); }, 86400_000);
      }),
    });
    return c.json(run, 201);
  });

  app.post("/api/workflows/runs/:id/gate", async (c) => {
    const { stepId, approved } = await c.req.json().catch(() => ({})) as { stepId: string; approved: boolean };
    const key = `${c.req.param("id")}:${stepId}`;
    const resolve = pendingHumanGates.get(key);
    if (!resolve) return c.json({ error: "no pending gate" }, 404);
    pendingHumanGates.delete(key);
    resolve(Boolean(approved));
    return c.json({ ok: true });
  });

  app.get("/api/workflows/runs", (c) => c.json(listWorkflowRuns()));
  app.get("/api/workflows/runs/:id", (c) => {
    const run = getWorkflowRun(c.req.param("id"));
    if (!run) return c.json({ error: "not found" }, 404);
    return c.json(run);
  });
  app.post("/api/workflows/runs/:id/cancel", (c) => {
    cancelWorkflowRun(c.req.param("id"));
    return c.json({ ok: true });
  });

  // ── GitHub adapter config ─────────────────────────────────────────────────────

  app.get("/api/github/config", (c) => c.json(loadGitHubConfig(DATA_DIR)));
  app.patch("/api/github/config", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const current = loadGitHubConfig(DATA_DIR);
    const updated = { ...current, ...body };
    saveGitHubConfig(DATA_DIR, updated);
    return c.json(updated);
  });
}
