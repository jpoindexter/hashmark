// server/routes/scan.ts
import { Hono } from "hono";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
function scanRoutes(projectDir) {
  const app = new Hono();
  app.post("/", async (c) => {
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    const send = (data) => `data: ${JSON.stringify(data)}

`;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(send({ type: "start", message: "Starting scan..." }));
        const cliPath = join(projectDir, "node_modules", ".bin", "hashmark");
        const bin = existsSync(cliPath) ? cliPath : "hashmark";
        const proc = spawn(bin, ["--json", "--output", "/dev/stdout"], {
          cwd: projectDir,
          env: process.env
        });
        let stdout = "";
        proc.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        proc.stderr.on("data", (chunk) => {
          const line = chunk.toString().trim();
          if (line) {
            controller.enqueue(send({ type: "progress", message: line }));
          }
        });
        proc.on("close", (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              controller.enqueue(send({ type: "complete", result }));
            } catch {
              controller.enqueue(send({ type: "complete", result: null }));
            }
          } else {
            controller.enqueue(send({ type: "error", message: `Scan exited with code ${code}` }));
          }
          controller.close();
        });
        proc.on("error", (err) => {
          controller.enqueue(send({ type: "error", message: err.message }));
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
  return app;
}
export {
  scanRoutes
};
