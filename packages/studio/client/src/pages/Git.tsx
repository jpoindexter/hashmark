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
  M: "#f59e0b", A: "#10b981", D: "#ef4444", "?": "#6366f1",
  R: "#8b5cf6", C: "#06b6d4", U: "#f97316",
};

function StatusBadge({ status }: { status: string }) {
  const char = status[0] ?? "?";
  return (
    <span style={{
      display: "inline-block", width: 16, height: 16, lineHeight: "16px",
      textAlign: "center", fontSize: 10, fontWeight: 700, fontFamily: "monospace",
      color: STATUS_COLOR[char] ?? "#71717a",
      background: "#18181b", borderRadius: 2, flexShrink: 0,
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
      <div style={{ padding: 24, color: "#52525b", fontFamily: "monospace", fontSize: 13 }}>
        Loading git status...
      </div>
    );
  }

  if (!data) return null;

  const staged = data.files.filter(f => f.status.length >= 2 && f.status[0] !== " " && f.status[0] !== "?");
  const unstaged = data.files.filter(f => f.status.length >= 2 && (f.status[1] !== " " || f.status[0] === "?"));

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "#09090b" }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px", borderBottom: "1px solid #18181b",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#52525b", fontSize: 11, fontFamily: "monospace" }}>BRANCH</span>
          <span style={{
            fontFamily: "monospace", fontSize: 13, color: "#10b981",
            background: "#0d1f17", padding: "2px 8px", borderRadius: 2,
          }}>
            {data.branch}
          </span>
          {data.error && (
            <span style={{ color: "#ef4444", fontSize: 11, fontFamily: "monospace" }}>
              {data.error}
            </span>
          )}
        </div>
        <button
          onClick={load}
          style={{
            background: "transparent", border: "1px solid #27272a", color: "#71717a",
            padding: "4px 10px", fontFamily: "monospace", fontSize: 11, cursor: "pointer",
            borderRadius: 2,
          }}
        >
          ↻ REFRESH
        </button>
      </div>

      <div style={{ padding: "16px 20px" }}>
        {/* Changes */}
        {data.files.length === 0 ? (
          <div style={{ color: "#3f3f46", fontFamily: "monospace", fontSize: 13, marginBottom: 24 }}>
            Working tree clean.
          </div>
        ) : (
          <>
            {staged.length > 0 && (
              <section style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "#52525b", letterSpacing: 1, marginBottom: 8 }}>
                  STAGED ({staged.length})
                </div>
                {staged.map(f => (
                  <div key={f.file} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <StatusBadge status={f.status[0]} />
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#d4d4d8" }}>{f.file}</span>
                  </div>
                ))}
              </section>
            )}
            {unstaged.length > 0 && (
              <section style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "#52525b", letterSpacing: 1, marginBottom: 8 }}>
                  CHANGES ({unstaged.length})
                </div>
                {unstaged.map(f => (
                  <div key={f.file} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <StatusBadge status={f.status[1] === "?" ? "?" : f.status[1]} />
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#a1a1aa" }}>{f.file}</span>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {/* Recent commits */}
        {data.commits.length > 0 && (
          <section>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: "#52525b", letterSpacing: 1, marginBottom: 8 }}>
              RECENT COMMITS
            </div>
            {data.commits.map(c => (
              <div key={c.hash} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0",
                borderBottom: "1px solid #0d0d0f",
              }}>
                <span style={{
                  fontFamily: "monospace", fontSize: 11, color: "#10b981",
                  flexShrink: 0, paddingTop: 1,
                }}>
                  {c.hash.slice(0, 7)}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#a1a1aa", lineHeight: 1.4 }}>
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
