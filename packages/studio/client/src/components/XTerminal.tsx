import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";

interface XTerminalProps {
  output: string;
  onInput?: (data: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function XTerminal({ output, onInput, className, style }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenLenRef = useRef(0);

  // Init terminal once
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: "#1e1e1e",
        foreground: "#cccccc",
        cursor: "#aeafad",
        black: "#000000",
        brightBlack: "#666666",
        red: "#cd3131",
        brightRed: "#f14c4c",
        green: "#0dbc79",
        brightGreen: "#23d18b",
        yellow: "#e5e510",
        brightYellow: "#f5f543",
        blue: "#2472c8",
        brightBlue: "#3b8eea",
        magenta: "#bc3fbc",
        brightMagenta: "#d670d6",
        cyan: "#11a8cd",
        brightCyan: "#29b8db",
        white: "#e5e5e5",
        brightWhite: "#e5e5e5",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new SearchAddon());

    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;
    writtenLenRef.current = 0;

    if (onInput) {
      term.onData(onInput);
    }

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      writtenLenRef.current = 0;
    };
  }, []);

  // Handle onInput changes without re-mounting
  useEffect(() => {
    if (!termRef.current || !onInput) return;
    const disposable = termRef.current.onData(onInput);
    return () => disposable.dispose();
  }, [onInput]);

  // Write only new output content as it streams in
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const prev = writtenLenRef.current;

    if (output.length < prev) {
      // Output was reset — clear and rewrite from scratch
      term.reset();
      writtenLenRef.current = 0;
      if (output.length > 0) {
        term.write(output);
        writtenLenRef.current = output.length;
      }
      return;
    }

    if (output.length > prev) {
      const chunk = output.slice(prev);
      term.write(chunk);
      writtenLenRef.current = output.length;
    }
  }, [output]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%", overflow: "hidden", ...style }}
    />
  );
}
