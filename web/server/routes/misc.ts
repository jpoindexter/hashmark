import { Hono } from "hono";
import { randomUUID } from "crypto";
import { join, resolve } from "path";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { getDb } from "../db.js";
import { loadProviders } from "../providers.js";
import { scanProject } from "../scanner.js";
import { rateLimitMiddleware } from "../ratelimit.js";


const SKILLS_DIR = join(homedir(), ".claude", "skills");

function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const parts = content.split("---");
  if (parts.length < 3) return { name: "", description: "" };
  const fm = parts[1];
  const nameMatch = fm.match(/name:\s*(.+)/);
  const descMatch = fm.match(/description:\s*(.+)/);
  return {
    name: (nameMatch?.[1] ?? "").trim(),
    description: (descMatch?.[1] ?? "").trim(),
  };
}

export function registerMiscRoutes(app: Hono, ctx: { dataDir: string; projectDir: string }) {
  const { dataDir: DATA_DIR, projectDir: PROJECT_DIR } = ctx;

  // ── Session Templates ─────────────────────────────────────────────────────────

  app.get("/api/templates", (c) => {
    return c.json(getDb(DATA_DIR).prepare("SELECT * FROM session_templates ORDER BY created_at DESC").all());
  });

  app.post("/api/templates", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { name?: string; description?: string; system_prompt?: string; model?: string; project_dir?: string };
    if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
    const id = randomUUID();
    getDb(DATA_DIR).prepare(
      "INSERT INTO session_templates (id, name, description, system_prompt, model, project_dir, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, body.name.trim(), body.description ?? null, body.system_prompt ?? null, body.model ?? null, body.project_dir ?? null, Date.now());
    return c.json(getDb(DATA_DIR).prepare("SELECT * FROM session_templates WHERE id = ?").get(id), 201);
  });

  app.delete("/api/templates/:id", (c) => {
    getDb(DATA_DIR).prepare("DELETE FROM session_templates WHERE id = ?").run(c.req.param("id"));
    return c.body(null, 204);
  });

  // ── Scan ──────────────────────────────────────────────────────────────────────

  app.get("/api/scan", async (c) => {
    const raw = c.req.query("dir") ?? PROJECT_DIR;
    const dir = resolve(raw);
    const boundary = PROJECT_DIR.endsWith("/") ? PROJECT_DIR : PROJECT_DIR + "/";
    if (dir !== PROJECT_DIR && !dir.startsWith(boundary)) return c.json({ error: "directory outside project" }, 403);
    const result = await scanProject(dir);
    return c.json(result);
  });

  // Generate agents from scan (SSE)
  app.post("/api/generate", rateLimitMiddleware(5, 60_000, "generate"), async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const scan = body.scan as Record<string, unknown>;
    const companyType = String(body.companyType ?? "SaaS");
    if (!scan) return c.json({ error: "scan required" }, 400);

    const { runClaudeOnce } = await import("../harness.js");

    const systemPrompt = `You are an AI agent company generator. Given a codebase scan, generate a team of specialized AI agents.

Return ONLY a JSON array of agents (no markdown, no explanation):
[
  {
    "name": "Agent Name",
    "description": "One-line role description",
    "system_prompt": "Full system prompt for this agent..."
  }
]

Generate 8-15 agents appropriate for a ${companyType} company. Each agent should have a specific role grounded in the actual codebase details provided.`;

    const scanSummary = JSON.stringify(scan, null, 2).slice(0, 8000);
    const userMsg = `Codebase scan:\n${scanSummary}\n\nGenerate a tailored agent team for this ${companyType} codebase.`;

    const ac = new AbortController();
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        try {
          let fullText = "";
          fullText = await runClaudeOnce({
            systemPrompt,
            message: userMsg,
            projectDir: PROJECT_DIR,
            signal: ac.signal,
            onChunk: (text) => send({ type: "text", text }),
          });

          const jsonMatch = fullText.match(/\[[\s\S]*\]/);
          if (!jsonMatch) { send({ type: "error", error: "No JSON array in response" }); return; }

          const agents = JSON.parse(jsonMatch[0]) as Array<{ name: string; description: string; system_prompt: string }>;
          const db = getDb(DATA_DIR);
          const saved: unknown[] = [];
          for (const a of agents) {
            if (!a.name?.trim()) continue;
            const id = randomUUID();
            db.prepare("INSERT INTO agents (id, name, description, model, system_prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
              id, a.name.trim(), a.description ?? null, null, a.system_prompt ?? "", Date.now()
            );
            saved.push(db.prepare("SELECT * FROM agents WHERE id = ?").get(id));
          }
          send({ type: "done", agents: saved });
        } catch (err) {
          send({ type: "error", error: err instanceof Error ? err.message : String(err) });
        } finally {
          try { controller.close(); } catch {}
        }
      },
      cancel() { ac.abort(); },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" },
    });
  });

  // ── Skills ───────────────────────────────────────────────────────────────────

  app.get("/api/skills", (c) => {
    if (!existsSync(SKILLS_DIR)) return c.json({ skills: [] });
    const skills: { id: string; name: string; description: string }[] = [];
    try {
      for (const entry of readdirSync(SKILLS_DIR)) {
        const skillPath = join(SKILLS_DIR, entry);
        try {
          if (!statSync(skillPath).isDirectory()) continue;
          const mdPath = join(skillPath, "SKILL.md");
          if (!existsSync(mdPath)) continue;
          const content = readFileSync(mdPath, "utf-8");
          const { name, description } = parseSkillFrontmatter(content);
          skills.push({ id: entry, name: name || entry, description });
        } catch {}
      }
    } catch {}
    return c.json({ skills });
  });

  app.get("/api/skills/:id", (c) => {
    const id = c.req.param("id");
    const mdPath = join(SKILLS_DIR, id, "SKILL.md");
    if (!resolve(mdPath).startsWith(SKILLS_DIR + "/")) return c.json({ error: "not found" }, 404);
    if (!existsSync(mdPath)) return c.json({ error: "not found" }, 404);
    try {
      const content = readFileSync(mdPath, "utf-8");
      const { name, description } = parseSkillFrontmatter(content);
      return c.json({ id, name: name || id, description, content });
    } catch {
      return c.json({ error: "cannot read skill" }, 500);
    }
  });

  // ── Artifacts ─────────────────────────────────────────────────────────────────

  app.get("/api/artifacts", (c) => {
    const artifactsBase = join(DATA_DIR, "artifacts");
    if (!existsSync(artifactsBase)) return c.json([]);
    const db = getDb(DATA_DIR);
    const entries = readdirSync(artifactsBase, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => {
        const sessionId = e.name;
        const session = db.prepare("SELECT id, title FROM sessions WHERE id = ?").get(sessionId) as { id: string; title: string } | undefined;
        const outputPath = join(artifactsBase, sessionId, "output.md");
        return {
          sessionId,
          title: session?.title ?? sessionId.slice(0, 8),
          hasOutput: existsSync(outputPath),
          updatedAt: existsSync(outputPath) ? statSync(outputPath).mtimeMs : 0,
        };
      })
      .filter(e => e.hasOutput)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return c.json(entries);
  });

  app.get("/api/artifacts/:sessionId/output", (c) => {
    const outputPath = join(DATA_DIR, "artifacts", c.req.param("sessionId"), "output.md");
    if (!existsSync(outputPath)) return c.json({ error: "not found" }, 404);
    return c.text(readFileSync(outputPath, "utf-8"));
  });

  // ── Git info ──────────────────────────────────────────────────────────────────

  app.get("/api/git-info", (c) => {
    try {
      const branch = execSync(`git -C "${PROJECT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null`, { timeout: 3000 }).toString().trim();
      return c.json({ branch: branch || "main" });
    } catch {
      return c.json({ branch: "main" });
    }
  });

  // ── Usage ─────────────────────────────────────────────────────────────────────

  app.get("/api/usage", (c) => {
    const db = getDb(DATA_DIR);
    const now = Date.now();
    const day7 = now - 7 * 24 * 60 * 60 * 1000;
    const day30 = now - 30 * 24 * 60 * 60 * 1000;
    const totals = db.prepare("SELECT COUNT(*) as sessions, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens FROM sessions").get() as { sessions: number; input_tokens: number | null; output_tokens: number | null };
    const totalMessages = (db.prepare("SELECT COUNT(*) as c FROM messages").get() as { c: number }).c;
    const sessionsLast30Days = (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE created_at >= ?").get(day30) as { c: number }).c;
    const messagesLast7Days = (db.prepare("SELECT COUNT(*) as c FROM messages WHERE created_at >= ?").get(day7) as { c: number }).c;
    const topSessions = db.prepare(
      "SELECT id, title, model, input_tokens, output_tokens FROM sessions WHERE (input_tokens + output_tokens) > 0 ORDER BY (input_tokens + output_tokens) DESC LIMIT 10"
    ).all() as { id: string; title: string; model: string; input_tokens: number; output_tokens: number }[];
    const modelBreakdown = db.prepare(
      "SELECT model, COUNT(*) as sessions, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens FROM sessions GROUP BY model ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC"
    ).all() as { model: string; sessions: number; input_tokens: number; output_tokens: number }[];

    const timeline = db.prepare(
      "SELECT CAST(created_at / 86400000 AS INTEGER) as day_epoch, COUNT(*) as count FROM messages WHERE created_at >= ? GROUP BY day_epoch ORDER BY day_epoch ASC"
    ).all(day30) as { day_epoch: number; count: number }[];

    const todayEpoch = Math.floor(now / 86400000);
    const timelineFull: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const epoch = todayEpoch - i;
      const found = timeline.find(t => t.day_epoch === epoch);
      const d = new Date(epoch * 86400000);
      timelineFull.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, count: found?.count ?? 0 });
    }

    return c.json({
      totalSessions: totals.sessions,
      totalMessages,
      totalInputTokens: totals.input_tokens ?? 0,
      totalOutputTokens: totals.output_tokens ?? 0,
      sessionsLast30Days,
      messagesLast7Days,
      topSessions,
      modelBreakdown,
      timeline: timelineFull,
    });
  });

}
