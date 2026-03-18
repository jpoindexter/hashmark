/**
 * /api/terminal — WebSocket PTY terminal
 * Attaches a ws.WebSocketServer to the existing HTTP server.
 * Bridges xterm.js in the renderer to a real shell via node-pty.
 */

import type { IncomingMessage, Server } from "http";
import os from "os";

type WebSocketMessage = { type: "input"; data: string } | { type: "resize"; cols: number; rows: number };

async function spawnPty(projectDir: string) {
  const pty = await import("node-pty");
  const shell = process.env.SHELL ?? (os.platform() === "win32" ? "cmd.exe" : "/bin/zsh");
  return pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: projectDir,
    env: process.env as Record<string, string>,
  });
}

export function attachTerminalWS(httpServer: Server, projectDir: string) {
  import("ws").then(({ WebSocketServer }) => {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
      const url = request.url ?? "";
      if (!url.startsWith("/api/terminal/ws")) return;

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });

    wss.on("connection", async (ws) => {
      let ptyProcess: Awaited<ReturnType<typeof spawnPty>> | null = null;

      try {
        ptyProcess = await spawnPty(projectDir);
      } catch (err) {
        ws.send(`\r\nFailed to start terminal: ${err}\r\n`);
        ws.close();
        return;
      }

      // PTY → WebSocket
      ptyProcess.onData((data) => {
        try { ws.send(data); } catch {}
      });

      ptyProcess.onExit(() => {
        try { ws.close(); } catch {}
      });

      // WebSocket → PTY
      ws.on("message", (raw) => {
        if (!ptyProcess) return;
        const msg = raw.toString();
        try {
          const parsed = JSON.parse(msg) as WebSocketMessage;
          if (parsed.type === "resize" && parsed.cols && parsed.rows) {
            ptyProcess.resize(parsed.cols, parsed.rows);
            return;
          }
          if (parsed.type === "input" && parsed.data) {
            ptyProcess.write(parsed.data);
            return;
          }
        } catch {}
        // plain string fallback
        ptyProcess.write(msg);
      });

      ws.on("close", () => {
        ptyProcess?.kill();
        ptyProcess = null;
      });

      ws.on("error", () => {
        ptyProcess?.kill();
        ptyProcess = null;
      });
    });
  });
}
