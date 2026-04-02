/**
 * Inter-session messaging system.
 *
 * Agents can send messages to other agents or sessions.
 * Used by: swarm agents coordinating, Kairos sending alerts,
 * dream mode sharing learnings, company workers sharing findings.
 *
 * Persistence: SQLite (inbox_messages table).
 * Real-time: in-memory listener map for SSE push.
 */

import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { getDb } from "../db.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type InboxMessageType = "info" | "warning" | "request" | "result";

export interface InboxMessage {
  id: string;
  from: string;
  to: string;
  type: InboxMessageType;
  subject: string;
  body: string;
  createdAt: number;
  readAt: number | null;
}

// ─── In-memory listener registry ────────────────────────────────────────────

const listeners = new Map<string, Set<(msg: InboxMessage) => void>>();

/**
 * Subscribe to messages targeting a specific ID (session, agent, or "broadcast").
 * Returns an unsubscribe function.
 */
export function subscribe(
  targetId: string,
  handler: (msg: InboxMessage) => void,
): () => void {
  let set = listeners.get(targetId);
  if (!set) {
    set = new Set();
    listeners.set(targetId, set);
  }
  set.add(handler);

  return () => {
    set!.delete(handler);
    if (set!.size === 0) listeners.delete(targetId);
  };
}

/**
 * Send a message. Persists to DB and notifies live subscribers.
 *
 * If `to` is "broadcast", all listeners on the "broadcast" channel are notified.
 */
export function sendMessage(
  dataDir: string,
  msg: Omit<InboxMessage, "id" | "createdAt" | "readAt">,
): InboxMessage {
  const db = getDb(dataDir);
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO inbox_messages (id, from_id, to_id, type, subject, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, msg.from, msg.to, msg.type, msg.subject, msg.body, now);

  const full: InboxMessage = {
    id,
    from: msg.from,
    to: msg.to,
    type: msg.type,
    subject: msg.subject,
    body: msg.body,
    createdAt: now,
    readAt: null,
  };

  // Notify direct listeners
  const direct = listeners.get(msg.to);
  if (direct) {
    for (const fn of direct) {
      try { fn(full); } catch {}
    }
  }

  // If not already a broadcast, also notify broadcast listeners
  if (msg.to !== "broadcast") {
    const bcast = listeners.get("broadcast");
    if (bcast) {
      for (const fn of bcast) {
        try { fn(full); } catch {}
      }
    }
  }

  return full;
}

/**
 * Get all unread messages for a target ID.
 * Also includes broadcast messages that are unread.
 */
export function getUnread(dataDir: string, targetId: string): InboxMessage[] {
  const db = getDb(dataDir);
  const rows = db.prepare(
    `SELECT id, from_id, to_id, type, subject, body, created_at, read_at
     FROM inbox_messages
     WHERE (to_id = ? OR to_id = 'broadcast') AND read_at IS NULL
     ORDER BY created_at DESC`,
  ).all(targetId) as DbRow[];

  return rows.map(rowToMessage);
}

/**
 * Get all messages for a target ID (read and unread).
 * Includes broadcast messages.
 */
export function getMessages(
  dataDir: string,
  targetId: string,
  limit = 50,
): InboxMessage[] {
  const db = getDb(dataDir);
  const rows = db.prepare(
    `SELECT id, from_id, to_id, type, subject, body, created_at, read_at
     FROM inbox_messages
     WHERE to_id = ? OR to_id = 'broadcast'
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(targetId, limit) as DbRow[];

  return rows.map(rowToMessage);
}

/**
 * Count unread messages for a target ID (including broadcasts).
 */
export function countUnread(dataDir: string, targetId: string): number {
  const db = getDb(dataDir);
  const row = db.prepare(
    `SELECT COUNT(*) as cnt FROM inbox_messages
     WHERE (to_id = ? OR to_id = 'broadcast') AND read_at IS NULL`,
  ).get(targetId) as { cnt: number };
  return row.cnt;
}

/**
 * Mark a single message as read.
 */
export function markRead(dataDir: string, messageId: string): boolean {
  const db = getDb(dataDir);
  const result = db.prepare(
    "UPDATE inbox_messages SET read_at = ? WHERE id = ? AND read_at IS NULL",
  ).run(Date.now(), messageId);
  return result.changes > 0;
}

/**
 * Mark all messages for a target as read.
 */
export function markAllRead(dataDir: string, targetId: string): number {
  const db = getDb(dataDir);
  const result = db.prepare(
    `UPDATE inbox_messages SET read_at = ?
     WHERE (to_id = ? OR to_id = 'broadcast') AND read_at IS NULL`,
  ).run(Date.now(), targetId);
  return result.changes;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

interface DbRow {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  subject: string;
  body: string;
  created_at: number;
  read_at: number | null;
}

function rowToMessage(row: DbRow): InboxMessage {
  return {
    id: row.id,
    from: row.from_id,
    to: row.to_id,
    type: row.type as InboxMessageType,
    subject: row.subject,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}
