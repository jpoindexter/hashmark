import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { encodeTerminalMsg } from "../../../shared/ws-contracts";
import { apiUrl, prefetchToken } from "../lib/api";

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

  const [containerReady, setContainerReady] = useState(false);

  // Wait for container to have dimensions before creating xterm
  useEffect(() => {
    const el = containerRef.current;
    if (!el || containerReady) return;
    if (el.offsetHeight > 0 && el.offsetWidth > 0) {
      setContainerReady(true);
      return;
    }
    const obs = new ResizeObserver(() => {
      if (el.offsetHeight > 0 && el.offsetWidth > 0) {
        obs.disconnect();
        setContainerReady(true);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [containerReady]);

  // Process OSC 633 shell integration sequences ourselves before writing to xterm.
  // This prevents xterm's built-in OSC 633 handler from calling registerDecoration
  // (a proposed API) and throwing errors. We extract CWD and shell integration events
  // from the raw data stream, then strip the sequences before passing to xterm.
  const shellIntegrationFiredRef = useRef(false);
  const processOsc633 = useRef((
    data: string,
    onCwdChange?: (cwd: string) => void,
    onShellIntegration?: () => void,
  ): string => {
    return data.replace(/\x1b\]633;([^\x07\x1b]*?)(?:\x07|\x1b\\)/g, (_match, payload: string) => {
      if (!shellIntegrationFiredRef.current) {
        shellIntegrationFiredRef.current = true;
        onShellIntegration?.();
      }
      const semi = payload.indexOf(";");
      const subtype = semi === -1 ? payload : payload.slice(0, semi);
      const content = semi === -1 ? "" : payload.slice(semi + 1);
      if (subtype === "P") {
        const eq = content.indexOf("=");
        if (eq !== -1 && content.slice(0, eq) === "Cwd" && onCwdChange) {
          onCwdChange(content.slice(eq + 1));
        }
      }
      return "";
    });
  });

  useEffect(() => {
    if (!containerRef.current || !containerReady || termRef.current) return;

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

    // --- WebSocket connection (await token before connecting) ---
    let ws: WebSocket | null = null;
    prefetchToken().then(() => {
      if (!termRef.current) return; // component unmounted
      const tokenUrl = apiUrl("/api/terminal/ws" + (tabId ? `?tab=${tabId}` : ""));
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}${tokenUrl}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws!.send(encodeTerminalMsg({ type: "resize", cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (evt) => {
        if (typeof evt.data === "string") {
          const filtered = processOsc633.current(evt.data, onCwdChange, onShellIntegration);
          term.write(filtered);
        } else {
          term.write(new Uint8Array(evt.data as ArrayBuffer));
        }
      };

      ws.onclose = () => {
        term.write("\r\n\x1b[2m[connection closed]\x1b[0m\r\n");
      };

      ws.onerror = () => {
        term.write("\r\n\x1b[31m[terminal connection error]\x1b[0m\r\n");
      };

      term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(encodeTerminalMsg({ type: "input", data }));
        }
      });
    });

    const observer = new ResizeObserver(() => {
      fit.fit();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(encodeTerminalMsg({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (ws) ws.close();
      term.dispose();
      termRef.current   = null;
      wsRef.current     = null;
      searchRef.current = null;
    };
  }, [containerReady]); // eslint-disable-line react-hooks/exhaustive-deps

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
            boxShadow: "var(--shadow-sm)",
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
          <button onClick={findPrev} title="Previous match (Shift+Enter)" aria-label="Previous match" style={searchBtnStyle}>
            ↑
          </button>
          <button onClick={findNext} title="Next match (Enter)" aria-label="Next match" style={searchBtnStyle}>
            ↓
          </button>
          <button
            onClick={closeSearch}
            title="Close (Escape)"
            aria-label="Close search"
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
