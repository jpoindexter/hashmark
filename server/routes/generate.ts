/**
 * /api/generate — generate agents via AI, stream results via SSE
 */

import { Hono } from "hono";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

interface GenerateRequest {
  companyType: string;
  projectName: string;
  provider: string;
  apiKey?: string;
  baseURL?: string;
}

interface SaveRequest {
  agents: Array<{ path: string; content: string }>;
}

export function generateRoutes(projectDir: string) {
  const app = new Hono();

  // POST /api/generate — stream agent generation via SSE
  app.post("/", async (c) => {
    const body = await c.req.json<GenerateRequest>();

    const stream = new ReadableStream({
      start(controller) {
        const send = (data: object) => {
          const chunk = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(chunk));
        };

        send({ type: "start", message: "Starting agent generation..." });

        // Build the hashmark agents command args
        const args = [
          "agents",
          "--yes",
          "--json-stream",
          "--type", body.companyType,
        ];

        if (body.projectName) {
          args.push("--name", body.projectName);
        }

        // Find hashmark binary — check local install, monorepo, then global
        const localBin = join(projectDir, "node_modules", ".bin", "hashmark");
        const monoBin = join(projectDir, "packages", "cli", "dist", "cli.js");
        const resolvedBin = existsSync(localBin) ? localBin
          : existsSync(monoBin) ? "node" : "hashmark";
        if (resolvedBin === "node") args.unshift(monoBin);

        const env: NodeJS.ProcessEnv = { ...process.env };
        // Include CLI's node_modules in NODE_PATH for dependency resolution
        const cliNodeModules = join(projectDir, "packages", "cli", "node_modules");
        if (existsSync(cliNodeModules)) {
          env.NODE_PATH = [cliNodeModules, env.NODE_PATH].filter(Boolean).join(":");
        }
        if (body.apiKey) {
          const keyMap: Record<string, string> = {
            anthropic: "ANTHROPIC_API_KEY",
            openai: "OPENAI_API_KEY",
            gemini: "GOOGLE_AI_API_KEY",
            xai: "XAI_API_KEY",
            mistral: "MISTRAL_API_KEY",
            groq: "GROQ_API_KEY",
          };
          const envVar = keyMap[body.provider];
          if (envVar) env[envVar] = body.apiKey;
          if (body.baseURL) env.OPENAI_BASE_URL = body.baseURL;
        }

        const proc = spawn(resolvedBin, args, { cwd: projectDir, env });

        let buffer = "";
        proc.stdout.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          // Parse NDJSON lines for agent events
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              send(event);
            } catch {
              // Not JSON — could be progress text
              if (trimmed.startsWith("{")) continue;
              send({ type: "progress", message: trimmed });
            }
          }
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          const line = chunk.toString().trim();
          if (line) send({ type: "progress", message: line });
        });

        proc.on("close", (code: number) => {
          send({ type: "done", success: code === 0 });
          controller.close();
        });

        proc.on("error", (err: Error) => {
          send({ type: "error", message: err.message });
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  });

  // POST /api/generate/save — write generated agents to disk
  app.post("/save", async (c) => {
    const body = await c.req.json<SaveRequest>();
    const agentsDir = join(projectDir, ".claude", "agents");

    for (const agent of body.agents) {
      const fullPath = join(agentsDir, agent.path);
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, agent.content, "utf-8");
    }

    return c.json({ ok: true, count: body.agents.length });
  });

  return app;
}
