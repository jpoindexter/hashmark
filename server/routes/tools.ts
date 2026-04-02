/**
 * /api/tools — custom tool plugin management
 * Lists user-defined tools from .hashmark/tools/*.json
 * and allows manual execution for testing.
 */

import { Hono } from "hono";
import {
  loadToolPlugins,
  executeToolPlugin,
  ensureToolsDir,
} from "../lib/tool-plugins.js";
import type { WorkspaceCtx } from "./workspaces.js";

export function toolsRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/tools -- list all registered custom tools
  app.get("/", (c) => {
    const plugins = loadToolPlugins(ctx.projectDir);
    return c.json({ tools: plugins });
  });

  // POST /api/tools/:name/execute -- manually trigger a tool (for testing)
  app.post("/:name/execute", async (c) => {
    const name = c.req.param("name");
    const plugins = loadToolPlugins(ctx.projectDir);
    const plugin = plugins.find((p) => p.name === name);

    if (!plugin) {
      return c.json({ error: `Tool "${name}" not found` }, 404);
    }

    if (plugin.requiresApproval) {
      const body = await c.req.json<{ approved?: boolean }>().catch(() => ({}));
      if (!(body as { approved?: boolean }).approved) {
        return c.json(
          {
            error: "This tool requires approval",
            tool: plugin,
            requiresApproval: true,
          },
          403,
        );
      }
    }

    try {
      const result = await executeToolPlugin(plugin, ctx.projectDir);
      return c.json({
        tool: plugin.name,
        output: result.output,
        exitCode: result.exitCode,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg, tool: plugin.name }, 500);
    }
  });

  // GET /api/tools/dir -- ensure tools directory exists and return its path
  app.get("/dir", (c) => {
    const dir = ensureToolsDir(ctx.projectDir);
    return c.json({ path: dir });
  });

  return app;
}
