/**
 * /api/daemon -- background task execution
 * Start Claude tasks that run detached from the browser session.
 * Results persist in the DB and can be reviewed later.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  startDaemon,
  stopDaemon,
  getDaemon,
  listDaemons,
} from "../lib/daemon.js";
import type { WorkspaceCtx } from "./workspaces.js";

const StartSchema = z.object({
  task: z.string().min(1).max(8000),
  agentId: z.string().max(200).optional(),
});

export function daemonRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // POST /api/daemon/start -- launch a background task
  app.post("/start", async (c) => {
    const parsed = StartSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
    }

    const result = startDaemon({
      task: parsed.data.task,
      agentId: parsed.data.agentId,
      projectDir: ctx.projectDir,
      dataDir: ctx.dataDir,
    });

    if ("error" in result) {
      return c.json({ error: result.error }, 429);
    }

    return c.json({ id: result.id }, 201);
  });

  // GET /api/daemon -- list all daemon runs
  app.get("/", (c) => {
    const items = listDaemons(ctx.dataDir);
    return c.json({ items });
  });

  // GET /api/daemon/:id -- get daemon status + output
  app.get("/:id", (c) => {
    const daemon = getDaemon(c.req.param("id"), ctx.dataDir);
    if (!daemon) return c.json({ error: "Not found" }, 404);
    return c.json(daemon);
  });

  // DELETE /api/daemon/:id -- cancel a running daemon
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const stopped = stopDaemon(id, ctx.dataDir);
    if (!stopped) {
      // Maybe it already finished -- check DB
      const daemon = getDaemon(id, ctx.dataDir);
      if (!daemon) return c.json({ error: "Not found" }, 404);
      return c.json({ error: "Daemon is not running", status: daemon.status }, 400);
    }
    return c.json({ ok: true });
  });

  // GET /api/daemon/:id/output -- stream output for running, full text for complete
  app.get("/:id/output", (c) => {
    const daemon = getDaemon(c.req.param("id"), ctx.dataDir);
    if (!daemon) return c.json({ error: "Not found" }, 404);

    if (daemon.status !== "running") {
      // Completed -- return full output as JSON
      return c.json({ output: daemon.output, status: daemon.status });
    }

    // Running -- stream as SSE so the client can tail the output
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        let lastLen = 0;

        const send = (data: object) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {}
        };

        // Poll the daemon's live output every 500ms
        const interval = setInterval(() => {
          const current = getDaemon(c.req.param("id"), ctx.dataDir);
          if (!current) {
            send({ type: "error", error: "Daemon disappeared" });
            clearInterval(interval);
            controller.close();
            return;
          }

          // Send new output since last check
          if (current.output.length > lastLen) {
            const delta = current.output.slice(lastLen);
            lastLen = current.output.length;
            send({ type: "chunk", text: delta });
          }

          // Send cost updates
          if (current.costUsd > 0) {
            send({ type: "cost", totalUsd: current.costUsd });
          }

          // Done?
          if (current.status !== "running") {
            send({ type: "done", status: current.status, costUsd: current.costUsd });
            clearInterval(interval);
            controller.close();
          }
        }, 500);

        // Initial burst -- send everything we have so far
        const initial = getDaemon(c.req.param("id"), ctx.dataDir);
        if (initial && initial.output.length > 0) {
          lastLen = initial.output.length;
          send({ type: "chunk", text: initial.output });
        }
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
