import { useState, useEffect } from "react";

interface GitFile { status: string; file: string; }
interface Commit { hash: string; message: string; }
interface GitData {
  branch: string;
  files: GitFile[];
  commits: Commit[];
  error?: string;
}

const STATUS_COLOR: Record<string, string> = {
  M: "#f59e0b", A: "var(--accent)", D: "var(--red)", "?": "#6366f1",
  R: "#8b5cf6", C: "#06b6d4", U: "#f97316",
};

function StatusBadge({ status }: { status: string }) {
  const char = status[0] ?? "?";
  return (
    <span style={{
      display: "inline-block", width: 16, height: 16, lineHeight: "16px",
      textAlign: "center", fontSize: 10, fontWeight: 700, fontFamily: "var(--font)",
      color: STATUS_COLOR[char] ?? "var(--text-dimmer)",
      background: "var(--bg-3)", borderRadius: "var(--radius-sm)", flexShrink: 0,
    }}>
      {char}
    </span>
  );
}

export default function GitPage() {
  const [data, setData] = useState<GitData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/files/git")
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ branch: "unknown", files: [], commits: [], error: "Failed to fetch git status" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "var(--text-dimmer)", fontFamily: "var(--font-ui)", fontSize: 12 }}>
        Loading git status...
      </div>
    );
  }

  if (!data) return null;

  const staged = data.files.filter(f => f.status.length >= 2 && f.status[0] !== " " && f.status[0] !== "?");
  const unstaged = data.files.filter(f => f.status.length >= 2 && (f.status[1] !== " " || f.status[0] === "?"));

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid var(--border-dim)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--text-dimmer)", fontSize: 10, fontFamily: "var(--font-ui)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Branch</span>
          <span style={{
            fontFamily: "var(--font)", fontSize: 12, color: "var(--accent)",
            background: "var(--accent-bg)", padding: "2px 8px", borderRadius: "var(--radius-sm)",
            border: "1px solid var(--accent-border)",
          }}>
            {data.branch}
          </span>
          {data.error && (
            <span style={{ color: "var(--red)", fontSize: 11, fontFamily: "var(--font-ui)" }}>
              {data.error}
            </span>
          )}
        </div>
        <button
          onClick={load}
          className="btn"
          style={{ fontSize: 11 }}
        >
          ↻ Refresh
        </button>
      </div>

      <div style={{ padding: "16px 20px" }}>
        {/* Changes */}
        {data.files.length === 0 ? (
          <div style={{ color: "var(--text-dimmer)", fontFamily: "var(--font-ui)", fontSize: 12, marginBottom: 24 }}>
            Working tree clean.
          </div>
        ) : (
          <>
            {staged.length > 0 && (
              <section style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--font-ui)", color: "var(--text-dimmer)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                  Staged ({staged.length})
                </div>
                {staged.map(f => (
                  <div key={f.file} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <StatusBadge status={f.status[0]} />
                    <span style={{ fontFamily: "var(--font)", fontSize: 12, color: "var(--text)" }}>{f.file}</span>
                  </div>
                ))}
              </section>
            )}
            {unstaged.length > 0 && (
              <section style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--font-ui)", color: "var(--text-dimmer)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                  Changes ({unstaged.length})
                </div>
                {unstaged.map(f => (
                  <div key={f.file} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <StatusBadge status={f.status[1] === "?" ? "?" : f.status[1]} />
                    <span style={{ fontFamily: "var(--font)", fontSize: 12, color: "var(--text-dim)" }}>{f.file}</span>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {/* Recent commits */}
        {data.commits.length > 0 && (
          <section>
            <div style={{ fontSize: 10, fontFamily: "var(--font-ui)", color: "var(--text-dimmer)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Recent Commits
            </div>
            {data.commits.map(c => (
              <div key={c.hash} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0",
                borderBottom: "1px solid var(--border-dim)",
              }}>
                <span style={{
                  fontFamily: "var(--font)", fontSize: 11, color: "var(--accent)",
                  flexShrink: 0, paddingTop: 1,
                }}>
                  {c.hash.slice(0, 7)}
                </span>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>
                  {c.message}
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
