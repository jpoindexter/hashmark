import { useEffect, useRef } from "react";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { getToken } from "../lib/api";
import "@xterm/xterm/css/xterm.css";

const DARK_THEME: ITheme = {
  background: "#0e0e10",
  foreground: "#e8e8ec",
  cursor: "#7b5ea7",
  selectionBackground: "#3a2d54",
  black: "#1c1c1f", brightBlack: "#50506a",
  red: "#e85c5c",   brightRed: "#e85c5c",
  green: "#34c97a", brightGreen: "#34c97a",
  yellow: "#e8b840", brightYellow: "#e8b840",
  blue: "#5a9cf0",  brightBlue: "#5a9cf0",
  magenta: "#7b5ea7", brightMagenta: "#c0b0ff",
  cyan: "#34c9a0",  brightCyan: "#34c9a0",
  white: "#e6e6ec", brightWhite: "#ffffff",
};

const LIGHT_THEME: ITheme = {
  background: "#f2f2f5",
  foreground: "#1a1a2e",
  cursor: "#6248a0",
  selectionBackground: "#c8bef0",
  black: "#484868", brightBlack: "#8888a8",
  red: "#c83838",   brightRed: "#c83838",
  green: "#18945a", brightGreen: "#18945a",
  yellow: "#a87820", brightYellow: "#a87820",
  blue: "#2860c0",  brightBlue: "#2860c0",
  magenta: "#6248a0", brightMagenta: "#6248a0",
  cyan: "#18945a",  brightCyan: "#18945a",
  white: "#1a1a2e", brightWhite: "#0d0d1a",
};

const OXIDE_THEME: ITheme = {
  background: "#131009",
  foreground: "#e8e5e0",
  cursor: "#a07870",
  selectionBackground: "#3d2420",
  black: "#1e1b16", brightBlack: "#504d49",
  red: "#e85c5c",   brightRed: "#e85c5c",
  green: "#34c97a", brightGreen: "#34c97a",
  yellow: "#e8b840", brightYellow: "#e8b840",
  blue: "#5a9cf0",  brightBlue: "#5a9cf0",
  magenta: "#a07870", brightMagenta: "#c4a89e",
  cyan: "#34c9a0",  brightCyan: "#34c9a0",
  white: "#e8e5e0", brightWhite: "#ffffff",
};

interface TerminalProps {
  height: number;
  theme: "dark" | "light" | "oxide";
}

export function TerminalPanel({ height, theme }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: theme === "light" ? LIGHT_THEME : theme === "oxide" ? OXIDE_THEME : DARK_THEME,
      fontFamily: '"Berkeley Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const serverPort = window.location.port === "3201" ? "3200" : (window.location.port || "3200");
    let destroyed = false;
    let observer: ResizeObserver | null = null;

    void getToken().then(token => {
      if (destroyed) return;

      const ws = new WebSocket(`ws://localhost:${serverPort}/api/terminal?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
        });
        // Send initial size
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data)) as { type: string; data?: string };
          if (msg.type === "output" && msg.data) term.write(msg.data);
          if (msg.type === "error" && msg.data) term.writeln(`\r\n\x1b[31m${msg.data}\x1b[0m`);
        } catch {}
      };

      ws.onclose = () => { try { term.writeln("\r\n\x1b[33m[disconnected]\x1b[0m"); } catch {} };
      ws.onerror = () => { try { term.writeln("\r\n\x1b[31m[connection error]\x1b[0m"); } catch {} };

      observer = new ResizeObserver(() => {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      });
      if (containerRef.current) observer.observe(containerRef.current);
    });

    return () => {
      destroyed = true;
      observer?.disconnect();
      try { wsRef.current?.close(); } catch {}
      try { term.dispose(); } catch {}
      termRef.current = null;
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    setTimeout(() => fitRef.current?.fit(), 50);
  }, [height]);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = theme === "light" ? LIGHT_THEME : theme === "oxide" ? OXIDE_THEME : DARK_THEME;
  }, [theme]);

  return (
    <div style={{ height: height - 32, padding: "4px 4px 0", background: theme === "light" ? LIGHT_THEME.background : theme === "oxide" ? OXIDE_THEME.background : DARK_THEME.background, overflow: "hidden" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
