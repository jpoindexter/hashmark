import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

interface WorkspaceConfig {
  setupCommand?: string;
  runCommand?: string;
  env?: Record<string, string>;
}

function getConfigPath(projectDir: string) {
  return join(projectDir, ".hashmark", "workspace.json");
}

function readConfig(projectDir: string): WorkspaceConfig {
  try {
    const p = getConfigPath(projectDir);
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8")) as WorkspaceConfig;
  } catch {}
  return {};
}

function writeConfig(projectDir: string, config: WorkspaceConfig) {
  const dir = join(projectDir, ".hashmark");
  mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(projectDir), JSON.stringify(config, null, 2));
}

const runningProcesses = new Map<string, { kill: () => void; name: string }>();

function streamCommand(
  name: string,
  command: string,
  cwd: string,
  env: Record<string, string>
): Response {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      const parts = command.trim().split(/\s+/);
      const bin = parts[0];
      const args = parts.slice(1);

      send({ type: "start", command });

      const proc = spawn(bin, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...env },
        shell: false,
      });

      runningProcesses.set(name, {
        name,
        kill: () => proc.kill("SIGTERM"),
      });

      proc.stdout.on("data", (chunk: Buffer) => {
        send({ type: "stdout", text: chunk.toString() });
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        send({ type: "stderr", text: chunk.toString() });
      });

      proc.on("close", (code: number | null) => {
        runningProcesses.delete(name);
        send({ type: "done", code, success: code === 0 || code === null });
        controller.close();
      });

      proc.on("error", (err: Error) => {
        runningProcesses.delete(name);
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
}

export function workspaceRoutes(projectDir: string) {
  const app = new Hono();

  // POST /api/workspace/detect — detect project framework from a given path
  app.post("/detect", async (c) => {
    const body = await c.req.json<{ path?: string }>().catch(() => ({}));
    const dir = (body as { path?: string }).path?.trim() || projectDir;

    if (!existsSync(dir)) return c.json({ error: "path not found" }, 400);

    const name = (() => {
      try {
        const pkgPath = join(dir, "package.json");
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
          if (pkg.name) return pkg.name;
        }
      } catch {}
      return dir.split("/").filter(Boolean).pop() ?? "project";
    })();

    // Detect framework by checking for known config files
    const checks: Array<{ file: string; framework: string }> = [
      { file: "tsconfig.json", framework: "TypeScript" },
      { file: "package.json", framework: "JavaScript" },
      { file: "Cargo.toml", framework: "Rust" },
      { file: "go.mod", framework: "Go" },
      { file: "pyproject.toml", framework: "Python" },
      { file: "setup.py", framework: "Python" },
      { file: "requirements.txt", framework: "Python" },
      { file: "Gemfile", framework: "Ruby" },
      { file: "pom.xml", framework: "Java" },
      { file: "build.gradle", framework: "Java" },
    ];

    let framework = "Unknown";
    for (const check of checks) {
      if (existsSync(join(dir, check.file))) {
        framework = check.framework;
        break;
      }
    }

    return c.json({ framework, name });
  });

  app.get("/config", (c) => {
    return c.json({ config: readConfig(projectDir) });
  });

  app.put("/config", async (c) => {
    const body = await c.req.json<WorkspaceConfig>();
    const current = readConfig(projectDir);
    const updated = { ...current, ...body };
    writeConfig(projectDir, updated);
    return c.json({ config: updated });
  });

  app.post("/run-setup", (c) => {
    const config = readConfig(projectDir);
    if (!config.setupCommand) return c.json({ error: "No setup command configured" }, 400);
    return streamCommand("setup", config.setupCommand, projectDir, config.env ?? {});
  });

  app.post("/run", (c) => {
    const config = readConfig(projectDir);
    if (!config.runCommand) return c.json({ error: "No run command configured" }, 400);
    return streamCommand("run", config.runCommand, projectDir, config.env ?? {});
  });

  app.post("/stop", async (c) => {
    const body = await c.req.json<{ processName: string }>().catch(() => ({ processName: "" }));
    const proc = runningProcesses.get(body.processName);
    if (proc) {
      proc.kill();
      return c.json({ ok: true });
    }
    return c.json({ ok: false, error: "Process not found" });
  });

  app.get("/status", (c) => {
    const running = Array.from(runningProcesses.keys());
    return c.json({ running });
  });

  return app;
}
