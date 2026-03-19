import { useState, useEffect, useRef, useCallback } from "react";
import { Search, File, X } from "lucide-react";

interface SearchResult {
  file: string;
  matches: Array<{ line: number; text: string }>;
}

export default function SearchSidebar() {
  const [query, setQuery] = useState("");
  const [glob, setGlob] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [totalMatches, setTotalMatches] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback((q: string, g: string) => {
    if (!q.trim()) {
      setResults([]);
      setTotalMatches(0);
      return;
    }
    setSearching(true);
    const params = new URLSearchParams({ q: q.trim() });
    if (g.trim()) params.set("glob", g.trim());
    fetch(`/api/files/search?${params}`)
      .then(r => r.json())
      .then((d: { results: SearchResult[]; matchCount: number }) => {
        setResults(d.results ?? []);
        setTotalMatches(d.matchCount ?? 0);
      })
      .catch(() => {
        setResults([]);
        setTotalMatches(0);
      })
      .finally(() => setSearching(false));
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value, glob), 300);
  };

  const handleGlobChange = (value: string) => {
    setGlob(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query, value), 300);
  };

  const openFile = (file: string, line?: number) => {
    window.dispatchEvent(
      new CustomEvent("studio:open-file", { detail: { path: file, line } })
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Search input */}
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ position: "relative" }}>
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-dimmer)",
              pointerEvents: "none",
            }}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleChange(e.target.value)}
            placeholder="Search files..."
            style={{
              width: "100%",
              background: "var(--bg-3)",
              border: "1px solid var(--border-dim)",
              borderRadius: "var(--radius)",
              color: "var(--text)",
              fontSize: 12,
              fontFamily: "var(--font-ui)",
              padding: "5px 28px 5px 28px",
              outline: "none",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "var(--border-dim)"; }}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults([]); setTotalMatches(0); }}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-dimmer)",
                padding: 2,
                display: "flex",
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <input
          value={glob}
          onChange={e => handleGlobChange(e.target.value)}
          placeholder="Files to include (e.g. *.ts)"
          style={{
            width: "100%",
            background: "var(--bg-3)",
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius)",
            color: "var(--text)",
            fontSize: 11,
            fontFamily: "var(--font)",
            padding: "4px 8px",
            outline: "none",
          }}
        />
      </div>

      {/* Results count */}
      {query && (
        <div style={{
          padding: "4px 12px",
          fontSize: 10,
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          borderBottom: "1px solid var(--border-dim)",
        }}>
          {searching
            ? "Searching..."
            : `${totalMatches} result${totalMatches !== 1 ? "s" : ""} in ${results.length} file${results.length !== 1 ? "s" : ""}`}
        </div>
      )}

      {/* Results list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {results.map(result => (
          <div key={result.file}>
            {/* File header */}
            <div
              onClick={() => openFile(result.file)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                fontSize: 11,
                fontFamily: "var(--font-ui)",
                color: "var(--text)",
                cursor: "pointer",
                background: "var(--bg-2)",
                borderBottom: "1px solid var(--border-dim)",
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-2)"; }}
            >
              <File size={12} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {result.file}
              </span>
              <span style={{
                fontSize: 9,
                color: "var(--text-dimmer)",
                background: "var(--bg-4)",
                borderRadius: 10,
                padding: "0 5px",
                flexShrink: 0,
              }}>
                {result.matches.length}
              </span>
            </div>
            {/* Match lines */}
            {result.matches.map((m, i) => (
              <div
                key={i}
                onClick={() => openFile(result.file, m.line)}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "2px 12px 2px 30px",
                  fontSize: 11,
                  fontFamily: "var(--font)",
                  cursor: "pointer",
                  lineHeight: 1.6,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--hover-bg)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ color: "var(--text-dimmer)", minWidth: 28, textAlign: "right", flexShrink: 0 }}>
                  {m.line}
                </span>
                <span style={{
                  color: "var(--text-dim)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {m.text}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
