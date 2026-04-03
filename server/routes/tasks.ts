/**
 * /api/tasks — create, list, stream, kill tasks
 */

import { Hono } from "hono";
import { taskStore, runTask, loadAgentContent } from "../runner.js";
import type { WorkspaceCtx } from "./workspaces.js";

interface CreateTaskBody {
  agentId: string | null;
  agentName: string;
  agentDept: string;
  agentPath: string | null;
  prompt: string;
  autoRun?: boolean;
}

export function tasksRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/tasks — list all tasks
  app.get("/", (c) => {
    return c.json({ tasks: taskStore.list() });
  });

  // GET /api/tasks/:id — single task
  app.get("/:id", (c) => {
    const task = taskStore.get(c.req.param("id"));
    if (!task) return c.json({ error: "Not found" }, 404);
    return c.json({ task });
  });

  // POST /api/tasks — create (and optionally run immediately)
  app.post("/", async (c) => {
    const body = await c.req.json<CreateTaskBody>();
    const task = taskStore.create(
      body.agentId,
      body.agentName,
      body.agentDept,
      body.prompt,
    );

    if (body.autoRun !== false) {
      const content = body.agentPath ? loadAgentContent(ctx.projectDir, body.agentPath) : null;
      // Run async, don't await
      setImmediate(() => runTask(ctx.projectDir, task.id, content, body.agentName));
    }

    return c.json({ task }, 201);
  });

  // DELETE /api/tasks/:id — kill running task
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const killed = taskStore.killProcess(id);
    if (!killed) {
      const task = taskStore.get(id);
      if (!task) return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  });

  // GET /api/tasks/:id/stream — SSE stream of task output
  app.get("/:id/stream", (c) => {
    const id = c.req.param("id");
    const task = taskStore.get(id);
    if (!task) return c.json({ error: "Not found" }, 404);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const send = (data: object) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {}
        };

        // Send existing output first
        if (task.output) {
          send({ type: "output", text: task.output });
        }

        // If task is already done, send final status and close
        if (task.status !== "running" && task.status !== "pending") {
          send({ type: "status", status: task.status, exitCode: task.exitCode });
          controller.close();
          return;
        }

        // Subscribe to live output
        const unsub = taskStore.subscribe(id, (chunk) => {
          send({ type: "output", text: chunk });

          // Check if task is done
          const current = taskStore.get(id);
          if (current && current.status !== "running" && current.status !== "pending") {
            send({ type: "status", status: current.status, exitCode: current.exitCode });
            controller.close();
            unsub();
          }
        });

        // Heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
          const current = taskStore.get(id);
          if (!current || (current.status !== "running" && current.status !== "pending")) {
            clearInterval(heartbeat);
            return;
          }
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15000);
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

  return app;
}
