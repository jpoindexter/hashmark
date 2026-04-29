import { Hono } from "hono";
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getDb, nextIssueId } from "../db.js";
import { getOAuthApiKey } from "../oauth.js";
import { runAgentTurn, runClaudeOnce } from "../harness.js";
import { rateLimitMiddleware } from "../ratelimit.js";

interface IssueTask { id: string; title: string; passes: boolean; }
interface Satisfaction { satisfied: boolean; score: number; notes: string; }

const activeRuns = new Map<string, AbortController>();

export function registerIssueRoutes(app: Hono, ctx: { dataDir: string; projectDir: string }) {
  const { dataDir: DATA_DIR, projectDir: PROJECT_DIR } = ctx;

  // ── Issues ────────────────────────────────────────────────────────────────────

  app.get("/api/issues", (c) => {
    const status = c.req.query("status");
    const db = getDb(DATA_DIR);
    const rows = status
      ? db.prepare("SELECT * FROM issues WHERE status = ? ORDER BY created_at DESC").all(status)
      : db.prepare("SELECT * FROM issues ORDER BY created_at DESC LIMIT 200").all();
    return c.json(rows);
  });

  app.post("/api/issues", async (c) => {
    const db = getDb(DATA_DIR);
    const body = await c.req.json().catch(() => ({}));
    if (!body.title?.trim()) return c.json({ error: "title required" }, 400);
    const id = randomUUID();
    const identifier = nextIssueId(db);
    const now = Date.now();
    db.prepare(
      "INSERT INTO issues (id, identifier, title, description, status, agent_id, project_dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, identifier, body.title.trim(), body.description ?? null, body.status ?? "backlog", body.agent_id ?? null, PROJECT_DIR, now, now);
    return c.json(db.prepare("SELECT * FROM issues WHERE id = ?").get(id), 201);
  });

  app.get("/api/issues/:id", (c) => {
    const db = getDb(DATA_DIR);
    const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(c.req.param("id"));
    if (!issue) return c.json({ error: "not found" }, 404);
    const runs = db.prepare("SELECT * FROM runs WHERE issue_id = ? ORDER BY created_at DESC LIMIT 20").all(c.req.param("id"));
    return c.json({ issue, runs });
  });

  app.patch("/api/issues/:id", async (c) => {
    const db = getDb(DATA_DIR);
    const body = await c.req.json().catch(() => ({}));
    const allowed = ["title", "description", "status", "agent_id", "tasks"];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const key of allowed) {
      if (key in body) {
        sets.push(`${key} = ?`);
        vals.push(key === "tasks" ? JSON.stringify(body[key]) : body[key]);
      }
    }
    if (!sets.length) return c.json({ error: "nothing to update" }, 400);
    sets.push("updated_at = ?");
    vals.push(Date.now(), c.req.param("id"));
    db.prepare(`UPDATE issues SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return c.json(db.prepare("SELECT * FROM issues WHERE id = ?").get(c.req.param("id")));
  });

  app.delete("/api/issues/:id", (c) => {
    getDb(DATA_DIR).prepare("DELETE FROM issues WHERE id = ?").run(c.req.param("id"));
    return c.body(null, 204);
  });

  // Run an issue with an agent (SSE)
  app.post("/api/issues/:id/run", rateLimitMiddleware(10, 60_000, "runs"), async (c) => {
    const issueId = c.req.param("id");
    const db = getDb(DATA_DIR);
    const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as Record<string, unknown> | undefined;
    if (!issue) return c.json({ error: "issue not found" }, 404);

    const apiKey = (await getOAuthApiKey()) ?? process.env.ANTHROPIC_API_KEY ?? undefined;
    if (!apiKey) return c.json({ error: "No Claude auth configured" }, 400);

    // Get agent system prompt if assigned
    let agentSystem = "";
    if (issue.agent_id) {
      const agent = db.prepare("SELECT system_prompt FROM agents WHERE id = ?").get(issue.agent_id) as { system_prompt: string } | undefined;
      agentSystem = agent?.system_prompt ?? "";
    }

    const runId = randomUUID();
    const now = Date.now();
    db.prepare("INSERT INTO runs (id, issue_id, agent_id, status, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, ?)").run(
      runId, issueId, issue.agent_id ?? null, now, now
    );
    db.prepare("UPDATE issues SET status = 'in_progress', updated_at = ? WHERE id = ?").run(now, issueId);

    const ac = new AbortController();
    activeRuns.set(runId, ac);

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };
        let output = "";
        const capturingSend = (data: object) => {
          const d = data as Record<string, unknown>;
          if (d.type === "text" && d.text) output += String(d.text);
          send(data);
        };

        try {
          const title = String(issue.title ?? "");
          const desc = String(issue.description ?? "");

          // Inject pending tasks into the message (prd.json pattern from Ralph)
          const tasks: IssueTask[] = JSON.parse(String(issue.tasks ?? "null") || "[]");
          const pendingTasks = tasks.filter(t => !t.passes);
          const taskSection = pendingTasks.length > 0
            ? "\n\nTasks to complete:\n" + tasks.map(t => `- [${t.passes ? "x" : " "}] ${t.title}`).join("\n")
            : "";

          const base = desc ? `${title}\n\n${desc}` : title;
          const message = base + taskSection;

          const projDir = String(issue.project_dir ?? PROJECT_DIR);
          await runAgentTurn({
            sessionId: runId,
            message,
            model: "claude-sonnet-4-6",
            apiKey: apiKey!,
            provider: "claude",
            systemPrompt: agentSystem,
            projectDir: projDir,
            dataDir: DATA_DIR,
            signal: ac.signal,
            send: capturingSend,
          });

          db.prepare("UPDATE runs SET status = 'done', output = ?, updated_at = ? WHERE id = ?").run(output.slice(0, 50000), Date.now(), runId);
          db.prepare("UPDATE issues SET status = 'in_review', updated_at = ? WHERE id = ?").run(Date.now(), issueId);

          // Scenario evaluator: check .hashmark/scenarios/{identifier}.md (holdout set)
          const identifier = String(issue.identifier ?? "");
          const scenarioPath = join(DATA_DIR, "scenarios", `${identifier}.md`);
          if (existsSync(scenarioPath) && output) {
            void evaluateScenario(scenarioPath, output, runId, DATA_DIR, apiKey!);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          db.prepare("UPDATE runs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(msg, Date.now(), runId);
          send({ type: "error", error: msg });
        } finally {
          activeRuns.delete(runId);
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" },
    });
  });

  // ── Agents ────────────────────────────────────────────────────────────────────

  app.get("/api/agents", (c) => {
    return c.json(getDb(DATA_DIR).prepare("SELECT * FROM agents ORDER BY created_at DESC").all());
  });

  app.post("/api/agents", async (c) => {
    const db = getDb(DATA_DIR);
    const body = await c.req.json().catch(() => ({}));
    if (!body.name) return c.json({ error: "name required" }, 400);
    const id = randomUUID();
    db.prepare("INSERT INTO agents (id, name, description, model, system_prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id, body.name, body.description ?? null, body.model ?? null, body.system_prompt ?? "", Date.now()
    );
    return c.json(db.prepare("SELECT * FROM agents WHERE id = ?").get(id), 201);
  });

  app.put("/api/agents/:id", async (c) => {
    const db = getDb(DATA_DIR);
    const body = await c.req.json().catch(() => ({}));
    db.prepare("UPDATE agents SET name = ?, description = ?, model = ?, system_prompt = ? WHERE id = ?").run(
      body.name, body.description ?? null, body.model ?? null, body.system_prompt ?? "", c.req.param("id")
    );
    return c.json(db.prepare("SELECT * FROM agents WHERE id = ?").get(c.req.param("id")));
  });

  app.delete("/api/agents/:id", (c) => {
    getDb(DATA_DIR).prepare("DELETE FROM agents WHERE id = ?").run(c.req.param("id"));
    return c.body(null, 204);
  });

}

async function evaluateScenario(scenarioPath: string, output: string, runId: string, dataDir: string, apiKey: string): Promise<void> {
  try {
    const criteria = readFileSync(scenarioPath, "utf-8");
    const truncatedOutput = output.length > 8000 ? output.slice(0, 4000) + "\n…\n" + output.slice(-4000) : output;
    const prompt = `You are a QA evaluator. Given the acceptance criteria below, evaluate whether the agent's output satisfies them.

ACCEPTANCE CRITERIA:
${criteria}

AGENT OUTPUT:
${truncatedOutput}

Respond with ONLY valid JSON in this exact shape:
{"satisfied": true|false, "score": 0.0-1.0, "notes": "one sentence explanation"}`;

    let result = "";
    await runClaudeOnce({
      systemPrompt: "You are a precise QA evaluator. Output only JSON.",
      message: prompt,
      model: "claude-haiku-4-5-20251001",
      projectDir: dataDir,
      onChunk: (t) => { result += t; },
    });

    // Extract JSON from response (may be wrapped in ```json blocks)
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const satisfaction = JSON.parse(jsonMatch[0]) as Satisfaction;
    getDb(dataDir).prepare("UPDATE runs SET satisfaction = ? WHERE id = ?")
      .run(JSON.stringify(satisfaction), runId);
  } catch {}
}
