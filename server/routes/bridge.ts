/**
 * /api/bridge — remote access pairing and device management
 */

import { Hono } from "hono";
import { getDb } from "../db.js";
import {
  enableBridge,
  disableBridge,
  isBridgeEnabled,
  generatePairingCode,
  validatePairingCode,
  pairDevice,
  getDevices,
  removeDevice,
  getBridgeState,
} from "../lib/bridge.js";
import type { WorkspaceCtx } from "./workspaces.js";

export function bridgeRoutes(ctx: WorkspaceCtx, port: number) {
  const app = new Hono();

  // GET /api/bridge/status — current bridge state
  app.get("/status", (c) => {
    const db = getDb(ctx.dataDir);
    const state = getBridgeState(db, port);

    // Never leak tokens in status response
    const safeDevices = state.devices.map(({ token: _t, ...rest }) => rest);

    return c.json({
      enabled: state.enabled,
      pairingCode: state.pairingCode,
      pairingExpiresAt: state.pairingExpiresAt,
      networkUrl: state.networkUrl,
      deviceCount: safeDevices.length,
    });
  });

  // POST /api/bridge/enable — enable bridge, generate pairing code
  app.post("/enable", (c) => {
    enableBridge();
    const code = generatePairingCode();
    const db = getDb(ctx.dataDir);
    const state = getBridgeState(db, port);

    return c.json({
      enabled: true,
      pairingCode: code,
      pairingExpiresAt: state.pairingExpiresAt,
      networkUrl: state.networkUrl,
    });
  });

  // POST /api/bridge/disable — disable bridge, revoke all tokens
  app.post("/disable", (c) => {
    const db = getDb(ctx.dataDir);
    disableBridge(db);

    return c.json({ enabled: false });
  });

  // POST /api/bridge/pair — exchange pairing code for bridge token
  // This endpoint is special: it does NOT require the studio token.
  // The pairing code itself is the auth mechanism.
  app.post("/pair", async (c) => {
    if (!isBridgeEnabled()) {
      return c.json({ error: "Bridge is not enabled" }, 403);
    }

    const body = await c.req.json<{ code?: string; deviceName?: string }>()
      .catch(() => ({} as { code?: string; deviceName?: string }));

    if (!body.code || typeof body.code !== "string") {
      return c.json({ error: "Pairing code required" }, 400);
    }

    if (!validatePairingCode(body.code)) {
      return c.json({ error: "Invalid or expired pairing code" }, 401);
    }

    const deviceName = body.deviceName || "Unknown Device";
    const db = getDb(ctx.dataDir);
    const device = pairDevice(db, deviceName);

    return c.json({
      deviceId: device.id,
      token: device.token,
      name: device.name,
    }, 201);
  });

  // GET /api/bridge/devices — list paired devices
  app.get("/devices", (c) => {
    if (!isBridgeEnabled()) {
      return c.json({ devices: [] });
    }

    const db = getDb(ctx.dataDir);
    const devices = getDevices(db);

    // Strip tokens from response
    const safe = devices.map(({ token: _t, ...rest }) => rest);
    return c.json({ devices: safe });
  });

  // DELETE /api/bridge/devices/:id — unpair a specific device
  app.delete("/devices/:id", (c) => {
    const deviceId = c.req.param("id");
    const db = getDb(ctx.dataDir);
    const removed = removeDevice(db, deviceId);

    if (!removed) return c.json({ error: "Device not found" }, 404);
    return c.json({ ok: true });
  });

  // POST /api/bridge/refresh-code — generate a new pairing code
  app.post("/refresh-code", (c) => {
    if (!isBridgeEnabled()) {
      return c.json({ error: "Bridge is not enabled" }, 403);
    }

    const code = generatePairingCode();
    const db = getDb(ctx.dataDir);
    const state = getBridgeState(db, port);

    return c.json({
      pairingCode: code,
      pairingExpiresAt: state.pairingExpiresAt,
    });
  });

  return app;
}
