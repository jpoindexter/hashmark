// server/routes/generate.ts
import { Hono } from "hono";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
function generateRoutes(projectDir) {
  const app = new Hono();
  app.post("/", async (c) => {
    const body = await c.req.json();
    const stream = new ReadableStream({
      start(controller) {
        const send = (data) => {
          const chunk = `data: ${JSON.stringify(data)}

`;
          controller.enqueue(new TextEncoder().encode(chunk));
        };
        send({ type: "start", message: "Starting agent generation..." });
        const args = [
          "agents",
          "--yes",
          "--dry-run",
          "--type",
          body.companyType
        ];
        if (body.projectName) {
          args.push("--name", body.projectName);
        }
        const cliPath = join(projectDir, "node_modules", ".bin", "hashmark");
        const bin = existsSync(cliPath) ? cliPath : "hashmark";
        const env = { ...process.env };
        if (body.apiKey) {
          const keyMap = {
            anthropic: "ANTHROPIC_API_KEY",
            openai: "OPENAI_API_KEY",
            gemini: "GOOGLE_AI_API_KEY",
            xai: "XAI_API_KEY",
            mistral: "MISTRAL_API_KEY",
            groq: "GROQ_API_KEY"
          };
          const envVar = keyMap[body.provider];
          if (envVar) env[envVar] = body.apiKey;
          if (body.baseURL) env.OPENAI_BASE_URL = body.baseURL;
        }
        const proc = spawn(bin, args, { cwd: projectDir, env });
        let buffer = "";
        proc.stdout.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              send(event);
            } catch {
              if (trimmed.startsWith("{")) continue;
              send({ type: "progress", message: trimmed });
            }
          }
        });
        proc.stderr.on("data", (chunk) => {
          const line = chunk.toString().trim();
          if (line) send({ type: "progress", message: line });
        });
        proc.on("close", (code) => {
          send({ type: "done", success: code === 0 });
          controller.close();
        });
        proc.on("error", (err) => {
          send({ type: "error", message: err.message });
          controller.close();
        });
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  });
  app.post("/save", async (c) => {
    const body = await c.req.json();
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
export {
  generateRoutes
};
