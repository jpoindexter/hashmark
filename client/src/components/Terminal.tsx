import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "xterm/css/xterm.css";
import { encodeTerminalMsg } from "../../../shared/ws-contracts";

export interface TerminalHandle {
  clear: () => void;
  paste: (text: string) => void;
  openSearch: () => void;
}

interface TerminalProps {
  tabId?: string;
  fontSize?: number;
  onCwdChange?: (cwd: string) => void;
  onShellIntegration?: () => void;
}

// OSC 633 sequence subtypes (VSCode shell integration)
const enum Osc633 {
  PromptStart  = "A",
  PromptEnd    = "B",
  CommandStart = "C",
  CommandDone  = "D",
  CommandLine  = "E",
  Property     = "P",
}

const TerminalPane = forwardRef<TerminalHandle, TerminalProps>(function TerminalPane(
  { tabId, fontSize = 12, onCwdChange, onShellIntegration },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<Terminal | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const fitRef       = useRef<FitAddon | null>(null);
  const searchRef    = useRef<SearchAddon | null>(null);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    clear: () => {
      if (termRef.current) termRef.current.reset();
    },
    paste: (text: string) => {
      if (termRef.current) termRef.current.paste(text);
    },
    openSearch: () => {
      setSearchVisible(true);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    },
  }));

  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      allowProposedApi: true,
      fontFamily: "JetBrains Mono, Fira Code, Menlo, monospace",
      fontSize,
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
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_, url) => {
      if (typeof window.studio?.openExternal === "function") {
        window.studio.openExternal(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }));
    term.loadAddon(search);
    term.open(containerRef.current);
    fit.fit();

    termRef.current  = term;
    fitRef.current   = fit;
    searchRef.current = search;

    // --- VSCode shell integration (OSC 633) ---
    let commandStartMarker: ReturnType<Terminal["registerMarker"]> | null = null;
    let shellIntegrationFired = false;

    term.parser.registerOscHandler(633, (data: string) => {
      if (!shellIntegrationFired) {
        shellIntegrationFired = true;
        onShellIntegration?.();
      }
      const semi = data.indexOf(";");
      const subtype = semi === -1 ? data : data.slice(0, semi);
      const payload = semi === -1 ? "" : data.slice(semi + 1);

      switch (subtype) {
        case Osc633.CommandStart: {
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
          const eq = payload.indexOf("=");
          if (eq === -1) return true;
          const key = payload.slice(0, eq);
          const value = payload.slice(eq + 1);
          if (key === "Cwd" && onCwdChange) {
            onCwdChange(value);
          }
          return true;
        }

        case Osc633.PromptStart:
        case Osc633.PromptEnd:
        case Osc633.CommandLine:
          return true;
      }

      return false;
    });

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
      termRef.current   = null;
      wsRef.current     = null;
      searchRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update font size when prop changes
  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.fontSize = fontSize;
    fitRef.current?.fit();
  }, [fontSize]);

  // Adaptive terminal theme: sync with light/dark mode
  useEffect(() => {
    const applyTheme = () => {
      if (!termRef.current) return;
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      termRef.current.options.theme = isLight
        ? {
            background: "#ffffff",
            foreground: "#1f2328",
            cursor: "#1a7f37",
            cursorAccent: "#ffffff",
            selectionBackground: "rgba(26, 127, 55, 0.2)",
            black: "#1f2328",
            red: "#cf222e",
            green: "#1a7f37",
            yellow: "#9a6700",
            blue: "#0969da",
            magenta: "#8250df",
            cyan: "#0891b2",
            white: "#656d76",
            brightBlack: "#8b949e",
            brightRed: "#a40e26",
            brightGreen: "#116329",
            brightYellow: "#7c4d00",
            brightBlue: "#0550ae",
            brightMagenta: "#6639ba",
            brightCyan: "#067a8b",
            brightWhite: "#1f2328",
          }
        : {
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
          };
    };

    // Apply on mount
    applyTheme();

    // Listen for theme changes dispatched by the theme toggle
    const handler = () => applyTheme();
    window.addEventListener("studio:theme-change", handler);

    // Also observe data-theme attribute changes on <html>
    const observer = new MutationObserver(() => applyTheme());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      window.removeEventListener("studio:theme-change", handler);
      observer.disconnect();
    };
  }, []);

  // Cmd+F to open search, Escape to close
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        setSearchVisible(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === "Escape" && searchVisible) {
        setSearchVisible(false);
        setSearchQuery("");
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [searchVisible]);

  // Incremental search as query changes
  useEffect(() => {
    if (!searchRef.current || !searchVisible) return;
    if (searchQuery) {
      searchRef.current.findNext(searchQuery, { incremental: true });
    }
  }, [searchQuery, searchVisible]);

  const closeSearch = () => {
    setSearchVisible(false);
    setSearchQuery("");
  };

  const findNext = () => {
    if (searchRef.current && searchQuery) {
      searchRef.current.findNext(searchQuery);
    }
  };

  const findPrev = () => {
    if (searchRef.current && searchQuery) {
      searchRef.current.findPrevious(searchQuery);
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          padding: "4px 0",
        }}
      />

      {searchVisible && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 10,
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "var(--bg-4)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "3px 5px",
            zIndex: 100,
            boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
          }}
        >
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.shiftKey ? findPrev() : findNext();
              }
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Find..."
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text, #e6edf3)",
              fontSize: 12,
              fontFamily: "var(--font-ui, -apple-system, sans-serif)",
              width: 160,
              padding: "2px 4px",
            }}
          />
          <button onClick={findPrev} title="Previous match (Shift+Enter)" style={searchBtnStyle}>
            ↑
          </button>
          <button onClick={findNext} title="Next match (Enter)" style={searchBtnStyle}>
            ↓
          </button>
          <button
            onClick={closeSearch}
            title="Close (Escape)"
            style={{ ...searchBtnStyle, color: "var(--text-dim)" }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
});

const searchBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text, #e6edf3)",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  padding: "2px 4px",
  borderRadius: 3,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export default TerminalPane;
