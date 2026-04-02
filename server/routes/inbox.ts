/**
 * /api/inbox — inter-session messaging
 *
 * Lets agents, sessions, and the system exchange messages.
 * Supports SSE for real-time delivery.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  sendMessage,
  getMessages,
  getUnread,
  countUnread,
  markRead,
  markAllRead,
  subscribe,
} from "../lib/inbox.js";
import type { WorkspaceCtx } from "./workspaces.js";

const SendSchema = z.object({
  from: z.string().min(1).max(200),
  to: z.string().min(1).max(200),
  type: z.enum(["info", "warning", "request", "result"]).default("info"),
  subject: z.string().min(1).max(500),
  body: z.string().max(50_000),
});

export function inboxRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/inbox?target=<id>&limit=50  — list messages for a target
  app.get("/", (c) => {
    const target = c.req.query("target") ?? "broadcast";
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
    const messages = getMessages(ctx.dataDir, target, limit);
    return c.json({ messages });
  });

  // GET /api/inbox/unread?target=<id>  — unread count
  app.get("/unread", (c) => {
    const target = c.req.query("target") ?? "broadcast";
    const count = countUnread(ctx.dataDir, target);
    return c.json({ count });
  });

  // POST /api/inbox/send  — send a message
  app.post("/send", async (c) => {
    const parsed = SendSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
    }

    const msg = sendMessage(ctx.dataDir, parsed.data);
    return c.json({ message: msg }, 201);
  });

  // POST /api/inbox/:id/read  — mark single message as read
  app.post("/:id/read", (c) => {
    const id = c.req.param("id");
    const updated = markRead(ctx.dataDir, id);
    if (!updated) return c.json({ error: "Message not found or already read" }, 404);
    return c.json({ ok: true });
  });

  // POST /api/inbox/read-all?target=<id>  — mark all as read
  app.post("/read-all", (c) => {
    const target = c.req.query("target") ?? "broadcast";
    const count = markAllRead(ctx.dataDir, target);
    return c.json({ ok: true, count });
  });

  // GET /api/inbox/stream?target=<id>  — SSE stream of new messages
  app.get("/stream", (c) => {
    const target = c.req.query("target") ?? "broadcast";

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {}
        };

        // Send current unread as initial batch
        const unread = getUnread(ctx.dataDir, target);
        if (unread.length > 0) {
          send({ type: "backlog", messages: unread });
        }

        // Subscribe to new messages for this target
        const unsub = subscribe(target, (msg) => {
          send({ type: "message", message: msg });
        });

        // Also subscribe to broadcast if target is specific
        let unsubBroadcast: (() => void) | null = null;
        if (target !== "broadcast") {
          unsubBroadcast = subscribe("broadcast", (msg) => {
            send({ type: "message", message: msg });
          });
        }

        // Heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(enc.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15_000);

        // Cleanup on client disconnect (AbortSignal from the request)
        c.req.raw.signal.addEventListener("abort", () => {
          unsub();
          if (unsubBroadcast) unsubBroadcast();
          clearInterval(heartbeat);
          try { controller.close(); } catch {}
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

  return app;
}
