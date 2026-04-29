import { Hono } from "hono";
import { registerSessionCrudRoutes } from "./sessions-crud.js";
import { registerSessionRunRoutes } from "./sessions-run.js";
import { registerSessionManageRoutes } from "./sessions-manage.js";

export function registerSessionRoutes(app: Hono, ctx: { dataDir: string; projectDir: string }) {
  registerSessionCrudRoutes(app, ctx);
  registerSessionRunRoutes(app, ctx);
  registerSessionManageRoutes(app, ctx);
}
