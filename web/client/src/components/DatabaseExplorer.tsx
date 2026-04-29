import { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";

interface QueryResult {
  columns: string[];
  rows: unknown[][];
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

interface TableMeta {
  columns: ColumnInfo[];
  expanded: boolean;
}

export function DatabaseExplorer() {
  const [tables, setTables] = useState<string[]>([]);
  const [tableMeta, setTableMeta] = useState<Record<string, TableMeta>>({});
  const [sql, setSql] = useState("SELECT name FROM sqlite_master WHERE type='table'");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchApi<{ tables: string[] }>("/api/db/tables")
      .then(d => setTables(d.tables))
      .catch(() => toast.error("Failed to load tables"));
  }, []);

  const runQuery = useCallback(async (query?: string) => {
    const q = (query ?? sql).trim();
    if (!q) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const data = await fetchApi<QueryResult>("/api/db/query", {
        method: "POST",
        body: JSON.stringify({ sql: q }),
      });
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setRunning(false);
    }
  }, [sql]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void runQuery();
    }
  };

  const selectTable = async (name: string) => {
    const q = `SELECT * FROM "${name}" LIMIT 100`;
    setSql(q);
    void runQuery(q);

    if (!tableMeta[name]) {
      try {
        const data = await fetchApi<QueryResult>("/api/db/query", {
          method: "POST",
          body: JSON.stringify({ sql: `PRAGMA table_info("${name}")` }),
        });
        const cols = data.rows.map(r => ({
          cid: r[0] as number,
          name: r[1] as string,
          type: r[2] as string,
          notnull: r[3] as number,
          dflt_value: r[4],
          pk: r[5] as number,
        }));
        setTableMeta(prev => ({ ...prev, [name]: { columns: cols, expanded: true } }));
      } catch { /* ignore pragma errors */ }
    } else {
      setTableMeta(prev => ({
        ...prev,
        [name]: { ...prev[name], expanded: !prev[name].expanded },
      }));
    }
  };

  const exportCsv = () => {
    if (!result) return;
    const lines = [
      result.columns.join(","),
      ...result.rows.map(row =>
        row.map(cell => {
          const s = cell === null ? "" : String(cell);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        }).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "query-result.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* Left: table list */}
      <div style={{
        width: 160, flexShrink: 0, borderRight: "1px solid var(--border)",
        overflowY: "auto", padding: "8px 0",
      }}>
        {tables.length === 0 && (
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-muted)" }}>No tables</div>
        )}
        {tables.map(name => {
          const meta = tableMeta[name];
          return (
            <div key={name}>
              <button
                onClick={() => void selectTable(name)}
                style={{
                  width: "100%", textAlign: "left", background: "none", border: "none",
                  padding: "5px 12px", fontSize: 11, cursor: "pointer",
                  color: "var(--text)", fontFamily: "var(--font-mono)",
                  display: "flex", alignItems: "center", gap: 4,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                <span style={{ color: "var(--text-muted)", fontSize: 9 }}>{meta?.expanded ? "▾" : "▸"}</span>
                {name}
              </button>
              {meta?.expanded && (
                <div style={{ paddingLeft: 20, paddingBottom: 4 }}>
                  {meta.columns.map(col => (
                    <div key={col.cid} style={{
                      padding: "2px 8px", fontSize: 10,
                      color: "var(--text-muted)", fontFamily: "var(--font-mono)",
                      display: "flex", gap: 4, alignItems: "baseline",
                    }}>
                      {col.pk > 0 && <span style={{ color: "var(--accent)", fontSize: 9 }}>PK</span>}
                      <span style={{ color: "var(--text-dim)" }}>{col.name}</span>
                      <span style={{ color: "var(--text-muted)", opacity: 0.7, fontSize: 9 }}>{col.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Right: query + results */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Query area */}
        <div style={{ padding: 8, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={e => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            spellCheck={false}
            style={{
              width: "100%", resize: "vertical", boxSizing: "border-box",
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "6px 8px",
              fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text)",
              outline: "none", lineHeight: 1.5,
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <button
              onClick={() => void runQuery()}
              disabled={running}
              className="btn btn-primary btn-sm"
            >
              {running ? "Running..." : "Run"}
            </button>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Ctrl+Enter</span>
            {result && (
              <button
                onClick={exportCsv}
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: "auto" }}
              >
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflow: "auto", fontSize: 11, fontFamily: "var(--font-mono)" }}>
          {error && (
            <div style={{ padding: "10px 12px", color: "var(--error, #ef4444)", fontSize: 11 }}>
              {error}
            </div>
          )}
          {result && result.columns.length > 0 && (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-elevated)" }}>
                    {result.columns.map(col => (
                      <th key={col} style={{
                        padding: "5px 10px", textAlign: "left", fontWeight: 600,
                        borderBottom: "1px solid var(--border)", color: "var(--text-dim)",
                        whiteSpace: "nowrap", position: "sticky", top: 0,
                        background: "var(--bg-elevated)",
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      style={{ borderBottom: "1px solid var(--border-subtle, var(--border))" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}
                    >
                      {row.map((cell, ci) => (
                        <td key={ci} style={{
                          padding: "4px 10px", color: cell === null ? "var(--text-muted)" : "var(--text)",
                          maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {cell === null ? "null" : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: "6px 10px", color: "var(--text-muted)", fontSize: 10, borderTop: "1px solid var(--border)" }}>
                {result.rows.length} {result.rows.length === 1 ? "row" : "rows"}
              </div>
            </>
          )}
          {result && result.columns.length === 0 && !error && (
            <div style={{ padding: "10px 12px", color: "var(--text-muted)" }}>No results</div>
          )}
        </div>
      </div>
    </div>
  );
}
