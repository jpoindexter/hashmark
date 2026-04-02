/**
 * Bridge -- remote access to hashmark studio.
 *
 * When enabled, exposes the studio API on the local network
 * with a one-time pairing code for security.
 *
 * Users can access the full UI from their phone, tablet,
 * or another computer on the same network.
 */

import { randomBytes, randomInt } from "crypto";
import { networkInterfaces } from "os";
import type Database from "better-sqlite3";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PairedDevice {
  id: string;
  name: string;
  token: string;
  paired_at: number;
  last_seen: number;
}

export interface BridgeState {
  enabled: boolean;
  pairingCode: string | null;
  pairingExpiresAt: number | null;
  networkUrl: string | null;
  devices: PairedDevice[];
}

// ── Network ──────────────────────────────────────────────────────────────────

export function getLocalIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

// ── Pairing code ─────────────────────────────────────────────────────────────

const PAIRING_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _pairingCode: string | null = null;
let _pairingExpiresAt: number | null = null;

export function generatePairingCode(): string {
  // 6-digit numeric code
  const code = String(randomInt(100000, 999999));
  _pairingCode = code;
  _pairingExpiresAt = Date.now() + PAIRING_TTL_MS;
  return code;
}

export function validatePairingCode(code: string): boolean {
  if (!_pairingCode || !_pairingExpiresAt) return false;
  if (Date.now() > _pairingExpiresAt) {
    // Expired -- clear it
    _pairingCode = null;
    _pairingExpiresAt = null;
    return false;
  }
  if (code !== _pairingCode) return false;

  // One-time use -- consume the code on successful validation
  _pairingCode = null;
  _pairingExpiresAt = null;
  return true;
}

export function getPairingState(): { code: string | null; expiresAt: number | null } {
  // Clear expired codes on read
  if (_pairingExpiresAt && Date.now() > _pairingExpiresAt) {
    _pairingCode = null;
    _pairingExpiresAt = null;
  }
  return { code: _pairingCode, expiresAt: _pairingExpiresAt };
}

// ── Bridge enable/disable ────────────────────────────────────────────────────

let _bridgeEnabled = false;

export function isBridgeEnabled(): boolean {
  return _bridgeEnabled;
}

export function enableBridge(): void {
  _bridgeEnabled = true;
}

export function disableBridge(db: Database.Database): void {
  _bridgeEnabled = false;
  _pairingCode = null;
  _pairingExpiresAt = null;
  // Revoke all paired devices
  db.prepare("DELETE FROM bridge_devices").run();
}

// ── Device management ────────────────────────────────────────────────────────

export function generateBridgeToken(): string {
  return `bridge_${randomBytes(32).toString("hex")}`;
}

export function pairDevice(
  db: Database.Database,
  name: string,
): PairedDevice {
  const id = randomBytes(8).toString("hex");
  const token = generateBridgeToken();
  const now = Date.now();

  db.prepare(`
    INSERT INTO bridge_devices (id, name, token, paired_at, last_seen)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, token, now, now);

  return { id, name, token, paired_at: now, last_seen: now };
}

export function getDevices(db: Database.Database): PairedDevice[] {
  return db.prepare("SELECT * FROM bridge_devices ORDER BY last_seen DESC").all() as PairedDevice[];
}

export function removeDevice(db: Database.Database, deviceId: string): boolean {
  const result = db.prepare("DELETE FROM bridge_devices WHERE id = ?").run(deviceId);
  return result.changes > 0;
}

export function validateBridgeToken(db: Database.Database, token: string): boolean {
  if (!_bridgeEnabled) return false;
  if (!token.startsWith("bridge_")) return false;

  const device = db.prepare("SELECT id FROM bridge_devices WHERE token = ?").get(token) as
    | { id: string }
    | undefined;

  if (!device) return false;

  // Update last_seen
  db.prepare("UPDATE bridge_devices SET last_seen = ? WHERE id = ?").run(Date.now(), device.id);
  return true;
}

// ── Full state ───────────────────────────────────────────────────────────────

export function getBridgeState(db: Database.Database, port: number): BridgeState {
  const pairing = getPairingState();
  const ip = getLocalIP();

  return {
    enabled: _bridgeEnabled,
    pairingCode: _bridgeEnabled ? pairing.code : null,
    pairingExpiresAt: _bridgeEnabled ? pairing.expiresAt : null,
    networkUrl: _bridgeEnabled && ip ? `http://${ip}:${port}` : null,
    devices: _bridgeEnabled ? getDevices(db) : [],
  };
}
