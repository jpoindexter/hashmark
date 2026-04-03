/**
 * /api/prompts -- editable harness prompts that turn any LLM into a coding agent
 */

import { Hono } from "hono";
import { z } from "zod";
import { loadPrompts, loadPrompt, savePrompt, buildHarnessPrompt } from "../lib/harness-prompts.js";
import type { WorkspaceCtx } from "./workspaces.js";

export function promptsRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // List all prompts
  app.get("/", (c) => {
    const prompts = loadPrompts(ctx.dataDir);
    return c.json({ prompts });
  });

  // Get a specific prompt
  app.get("/:id", (c) => {
    const prompt = loadPrompt(ctx.dataDir, c.req.param("id"));
    if (!prompt) return c.json({ error: "Prompt not found" }, 404);
    return c.json({ prompt });
  });

  // Update a prompt
  const UpdateSchema = z.object({
    content: z.string().min(1).max(50000),
    name: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
  });

  app.put("/:id", async (c) => {
    const parsed = UpdateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, 400);
    savePrompt(ctx.dataDir, c.req.param("id"), parsed.data.content, parsed.data.name, parsed.data.description);
    return c.json({ ok: true });
  });

  // Preview the full assembled prompt
  app.get("/preview/full", (c) => {
    const mode = (c.req.query("mode") ?? "build") as "build" | "plan" | "review" | "coordinator";
    const prompt = buildHarnessPrompt(ctx.dataDir, {
      mode,
      env: { cwd: ctx.projectDir, platform: process.platform, shell: process.env.SHELL ?? "zsh" },
    });
    return c.json({ prompt, length: prompt.length, estimatedTokens: Math.ceil(prompt.length / 4) });
  });

  return app;
}
