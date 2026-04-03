/**
 * Typed WebSocket contracts for the studio server/client boundary (#68).
 *
 * Both server (Node/Hono) and client (Vite/React) import from here so the
 * message shapes can never silently diverge.
 *
 * Terminal WS — ws://localhost:3200/api/terminal/ws
 *   Client → Server: TerminalClientMsg
 *   Server → Client: raw string (PTY output, no wrapper needed)
 */

// ---------------------------------------------------------------------------
// Terminal — client → server
// ---------------------------------------------------------------------------

/** User typed input to forward to the PTY. */
export interface TerminalInputMsg {
  type: "input";
  data: string;
}

/** Terminal viewport resize notification. */
export interface TerminalResizeMsg {
  type: "resize";
  cols: number;
  rows: number;
}

/** Union of all messages the terminal client can send. */
export type TerminalClientMsg = TerminalInputMsg | TerminalResizeMsg;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Serialise a TerminalClientMsg to a JSON string ready to pass to ws.send(). */
export function encodeTerminalMsg(msg: TerminalClientMsg): string {
  return JSON.stringify(msg);
}

/** Deserialise a raw WebSocket message into a TerminalClientMsg.
 *  Returns null if the payload cannot be parsed or has an unknown type. */
export function decodeTerminalMsg(raw: string): TerminalClientMsg | null {
  try {
    const parsed = JSON.parse(raw) as { type?: string; data?: string; cols?: number; rows?: number };
    if (parsed.type === "input" && typeof parsed.data === "string") {
      return { type: "input", data: parsed.data };
    }
    if (parsed.type === "resize" && typeof parsed.cols === "number" && typeof parsed.rows === "number") {
      return { type: "resize", cols: parsed.cols, rows: parsed.rows };
    }
    return null;
  } catch {
    return null;
  }
}
