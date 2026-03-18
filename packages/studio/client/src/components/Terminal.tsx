import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";

interface TerminalProps {
  tabId?: string;
}

export default function TerminalPane({ tabId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      fontFamily: "JetBrains Mono, Fira Code, Menlo, monospace",
      fontSize: 12,
      lineHeight: 1.5,
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#3fb950",
        cursorAccent: "#0d1117",
        selectionBackground: "rgba(63, 185, 80, 0.2)",
        black: "#21262d",
        red: "#f85149",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#388bfd",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ff7b72",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#ffffff",
      },
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Connect WebSocket
    const wsUrl = tabId
      ? `ws://localhost:3200/api/terminal/ws?tab=${tabId}`
      : `ws://localhost:3200/api/terminal/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send initial size
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (evt) => {
      term.write(typeof evt.data === "string" ? evt.data : new Uint8Array(evt.data as ArrayBuffer));
    };

    ws.onclose = () => {
      term.write("\r\n\x1b[2m[connection closed]\x1b[0m\r\n");
    };

    ws.onerror = () => {
      term.write("\r\n\x1b[31m[terminal connection error]\x1b[0m\r\n");
    };

    // Terminal → WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Resize observer
    const observer = new ResizeObserver(() => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      ws.close();
      term.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        padding: "4px 0",
      }}
    />
  );
}
