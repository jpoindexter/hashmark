import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import { encodeTerminalMsg } from "../../../../shared/ws-contracts";

interface TerminalProps {
  tabId?: string;
  onCwdChange?: (cwd: string) => void;
}

// OSC 633 sequence subtypes (VSCode shell integration)
// A=prompt start, B=prompt end, C=command start, D=command done (with exit code), E=command line, P=property
const enum Osc633 {
  PromptStart  = "A",
  PromptEnd    = "B",
  CommandStart = "C",
  CommandDone  = "D",
  CommandLine  = "E",
  Property     = "P",
}

export default function TerminalPane({ tabId, onCwdChange }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<Terminal | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const fitRef       = useRef<FitAddon | null>(null);

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
      overviewRulerWidth: 12,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current  = fit;

    // --- VSCode shell integration (OSC 633) ---
    // Track marker for the current command start so we can decorate on exit
    let commandStartMarker: ReturnType<Terminal["registerMarker"]> | null = null;

    term.parser.registerOscHandler(633, (data: string) => {
      const semi = data.indexOf(";");
      const subtype = semi === -1 ? data : data.slice(0, semi);
      const payload = semi === -1 ? "" : data.slice(semi + 1);

      switch (subtype) {
        case Osc633.CommandStart: {
          // Mark the line where the command starts — used for overview ruler decoration
          const marker = term.registerMarker(0);
          if (marker) {
            commandStartMarker = marker;
            term.registerDecoration({
              marker,
              overviewRulerOptions: { color: "#388bfd88", position: "left" },
            });
          }
          return true;
        }

        case Osc633.CommandDone: {
          // payload = exit code (may be empty string if interrupted)
          const exitCode = payload === "" ? 0 : parseInt(payload, 10);
          const marker = term.registerMarker(0);
          if (marker) {
            const color = exitCode === 0 ? "#3fb95066" : "#f8514966";
            term.registerDecoration({
              marker,
              overviewRulerOptions: { color, position: "right" },
            });
          }
          commandStartMarker = null;
          return true;
        }

        case Osc633.Property: {
          // payload = "key=value"
          const eq = payload.indexOf("=");
          if (eq === -1) return true;
          const key = payload.slice(0, eq);
          const value = payload.slice(eq + 1);
          if (key === "Cwd" && onCwdChange) {
            onCwdChange(value);
          }
          return true;
        }

        // PromptStart (A), PromptEnd (B), CommandLine (E) — acknowledged but no action needed
        case Osc633.PromptStart:
        case Osc633.PromptEnd:
        case Osc633.CommandLine:
          return true;
      }

      return false;
    });

    // Suppress unused warning — commandStartMarker is read in CommandDone case
    void commandStartMarker;

    // --- WebSocket connection ---
    const wsUrl = tabId
      ? `ws://localhost:3200/api/terminal/ws?tab=${tabId}`
      : `ws://localhost:3200/api/terminal/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(encodeTerminalMsg({ type: "resize", cols: term.cols, rows: term.rows }));
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

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encodeTerminalMsg({ type: "input", data }));
      }
    });

    const observer = new ResizeObserver(() => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encodeTerminalMsg({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      ws.close();
      term.dispose();
      termRef.current = null;
      wsRef.current   = null;
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
