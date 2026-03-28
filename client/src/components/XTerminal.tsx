import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";

export interface XTerminalHandle {
  clear: () => void;
}

interface XTerminalProps {
  output: string;
  onInput?: (data: string) => void;
  onCopy?: (text: string) => void;
  fontSize?: number;
  className?: string;
  style?: React.CSSProperties;
}

const XTerminal = forwardRef<XTerminalHandle, XTerminalProps>(function XTerminal(
  { output, onInput, onCopy, fontSize = 13, className, style },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const writtenLenRef = useRef(0);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    clear: () => {
      if (termRef.current) {
        termRef.current.reset();
        writtenLenRef.current = 0;
      }
    },
  }));

  // Init terminal once
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      allowProposedApi: true,
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize,
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
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(search);

    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;
    writtenLenRef.current = 0;

    if (onInput) {
      term.onData(onInput);
    }

    // Copy callback via terminal selection
    if (onCopy) {
      term.onSelectionChange(() => {
        const sel = term.getSelection();
        if (sel) onCopy(sel);
      });
    }

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      writtenLenRef.current = 0;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle onInput changes without re-mounting
  useEffect(() => {
    if (!termRef.current || !onInput) return;
    const disposable = termRef.current.onData(onInput);
    return () => disposable.dispose();
  }, [onInput]);

  // Update font size when prop changes
  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.fontSize = fontSize;
    fitRef.current?.fit();
  }, [fontSize]);

  // Write only new output content as it streams in
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const prev = writtenLenRef.current;

    if (output.length < prev) {
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

  // Cmd+F keydown on container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchVisible(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === "Escape") {
        setSearchVisible(false);
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, []);

  // Run incremental search as query changes
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
    <div
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    >
      <div
        ref={containerRef}
        className={className}
        style={{ width: "100%", height: "100%", overflow: "hidden", ...style }}
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
              if (e.key === "Enter") e.shiftKey ? findPrev() : findNext();
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Find…"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#cccccc",
              fontSize: 12,
              fontFamily: "var(--font-ui, -apple-system, sans-serif)",
              width: 160,
              padding: "2px 4px",
            }}
          />
          <button
            onClick={findPrev}
            title="Previous match (Shift+Enter)"
            style={searchBtnStyle}
          >
            ↑
          </button>
          <button
            onClick={findNext}
            title="Next match (Enter)"
            style={searchBtnStyle}
          >
            ↓
          </button>
          <button
            onClick={closeSearch}
            title="Close"
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
  color: "#cccccc",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  padding: "2px 4px",
  borderRadius: 3,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export default XTerminal;
