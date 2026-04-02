import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DiffPanel } from "../components/DiffPanel.tsx";
import { fetchApi } from "../lib/api";
import { timeAgo } from "../lib/format";

interface CommitEntry {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: string[];
  branches: string[];
}

interface LogData {
  commits: CommitEntry[];
  error?: string;
}

interface BranchInfo {
  branch: string;
  ahead: number;
  behind: number;
  files: Array<{ status: string; file: string }>;
  error?: string;
}

interface DiffState {
  hash: string;
  file: string;
  diff: string;
  loading: boolean;
}

// Branch-specific colors for visual distinction (no Grove token equivalent)
const BRANCH_COLORS: Array<{ fg: string; bg: string; border: string }> = [
  { fg: "var(--accent)", bg: "var(--accent-bg)", border: "var(--accent)" },
  { fg: "var(--blue)", bg: "var(--blue-bg)", border: "var(--blue)" },
  { fg: "#8b5cf6", bg: "#8b5cf618", border: "#8b5cf640" },
  { fg: "#f97316", bg: "#f9731618", border: "#f9731640" },
  { fg: "var(--cyan)", bg: "var(--cyan-bg)", border: "var(--cyan)" },
  { fg: "var(--yellow)", bg: "var(--yellow-bg)", border: "var(--yellow)" },
];

function branchColorSet(name: string): { fg: string; bg: string; border: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return BRANCH_COLORS[Math.abs(h) % BRANCH_COLORS.length];
}

function CommitDot({ isMerge }: { isMerge: boolean }) {
  return (
    <div style={{
      width: 10, height: 10, borderRadius: "50%",
      background: isMerge ? "var(--blue)" : "var(--accent)",
      border: `2px solid ${isMerge ? "var(--blue)" : "var(--accent)"}`,
      boxShadow: `0 0 6px ${isMerge ? "rgba(56,139,253,0.4)" : "rgba(63,185,80,0.4)"}`,
      flexShrink: 0,
      marginTop: 3,
    }} />
  );
}

function BranchBadge({ name }: { name: string }) {
  const isCurrent = name.startsWith("*");
  const display = isCurrent ? name.slice(1) : name;
  const cs = branchColorSet(display);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 6px", borderRadius: 100,
      fontSize: 10, fontFamily: "var(--font)", fontWeight: 600,
      color: cs.fg, background: cs.bg,
      border: `1px solid ${cs.border}`,
      flexShrink: 0,
    }}>
      {isCurrent && <span style={{ fontSize: 8 }}>●</span>}
      {display}
    </span>
  );
}

interface CommitRowProps {
  commit: CommitEntry;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
  onFileClick: (hash: string, file: string) => void;
  activeDiff: DiffState | null;
}

function CommitRow({ commit, isLast, expanded, onToggle, onFileClick, activeDiff }: CommitRowProps) {
  const isMerge = commit.subject.toLowerCase().startsWith("merge");
  const hasStats = commit.filesChanged > 0;

  return (
    <div style={{ display: "flex", gap: 0 }}>
      {/* Timeline spine */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        width: 24, flexShrink: 0, paddingTop: 4,
      }}>
        <CommitDot isMerge={isMerge} />
        {!isLast && (
          <div style={{
            flex: 1, width: 1, marginTop: 3,
            background: "var(--border-dim)", minHeight: 16,
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingLeft: 10, paddingBottom: isLast ? 0 : 4 }}>
        <div
          onClick={onToggle}
          style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "4px 8px 4px 0", cursor: "pointer",
            borderRadius: "var(--radius-sm)",
            transition: "background 0.1s",
          }}
          className="hoverable"
        >
          {/* Short hash */}
          <span style={{
            fontFamily: "var(--font)", fontSize: 11, color: "var(--accent)",
            flexShrink: 0, paddingTop: 1, minWidth: 50,
          }}>
            {commit.shortHash}
          </span>

          {/* Subject + branches */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {commit.branches.length > 0 && commit.branches.map(b => (
                <BranchBadge key={b} name={b} />
              ))}
              <span style={{
                fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--text)",
                lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {commit.subject}
              </span>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginTop: 2,
            }}>
              <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--text-dimmer)" }}>
                {commit.author}
              </span>
              <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--text-dimmer)" }}>
                {timeAgo(new Date(commit.date).getTime())}
              </span>
            </div>
          </div>

          {/* Stats */}
          {hasStats && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              flexShrink: 0, paddingTop: 1,
            }}>
              <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--text-dimmer)" }}>
                {commit.filesChanged} {commit.filesChanged === 1 ? "file" : "files"}
              </span>
              {commit.insertions > 0 && (
                <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>
                  +{commit.insertions}
                </span>
              )}
              {commit.deletions > 0 && (
                <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--red)", fontWeight: 600 }}>
                  -{commit.deletions}
                </span>
              )}
            </div>
          )}

          {/* Expand toggle */}
          <span style={{
            color: "var(--text-dimmer)", fontSize: 10, flexShrink: 0, paddingTop: 2,
            transition: "transform 0.15s",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            display: "inline-block",
          }}>
            ▶
          </span>
        </div>

        {/* Expanded file list */}
        {expanded && commit.files.length > 0 && (
          <div style={{
            marginTop: 4, marginBottom: 8,
            background: "var(--bg-2)",
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
          }}>
            {commit.files.map(file => {
              const isActive = activeDiff?.hash === commit.hash && activeDiff?.file === file;
              return (
                <div
                  key={file}
                  className={isActive ? undefined : "hoverable"}
                  onClick={() => onFileClick(commit.hash, file)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 10px", cursor: "pointer",
                    background: isActive ? "var(--accent-bg)" : "transparent",
                    borderBottom: "1px solid var(--border-dim)",
                  }}
                >
                  <span style={{
                    fontSize: 10, color: isActive ? "var(--accent)" : "var(--text-dimmer)",
                    flexShrink: 0,
                  }}>
                    {isActive ? "▶" : "○"}
                  </span>
                  <span style={{
                    fontFamily: "var(--font)", fontSize: 11,
                    color: isActive ? "var(--accent)" : "var(--text-dim)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {file}
                  </span>
                  {activeDiff?.hash === commit.hash && activeDiff?.file === file && activeDiff.loading && (
                    <span style={{ fontSize: 10, color: "var(--text-dimmer)", marginLeft: "auto" }}>
                      loading...
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GitPage() {
  const navigate = useNavigate();
  const [logData, setLogData] = useState<LogData | null>(null);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedHashes, setExpandedHashes] = useState<Set<string>>(new Set());
  const [activeDiff, setActiveDiff] = useState<DiffState | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchApi("/api/files/git/log").then(r => r.json() as Promise<LogData>),
      fetchApi("/api/files/git").then(r => r.json() as Promise<BranchInfo>),
    ])
      .then(([log, branch]) => {
        setLogData(log);
        setBranchInfo(branch);
      })
      .catch(() => {
        setLogData({ commits: [], error: "Failed to fetch git log" });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (hash: string) => {
    setExpandedHashes(prev => {
      const next = new Set(prev);
      if (next.has(hash)) { next.delete(hash); } else { next.add(hash); }
      return next;
    });
  };

  const handleFileClick = async (hash: string, file: string) => {
    // If same file already shown, close it
    if (activeDiff?.hash === hash && activeDiff?.file === file) {
      setActiveDiff(null);
      return;
    }
    setActiveDiff({ hash, file, diff: "", loading: true });
    try {
      const res = await fetchApi(`/api/files/git/commit-diff?hash=${encodeURIComponent(hash)}&file=${encodeURIComponent(file)}`);
      const data = await res.json() as { diff: string; error?: string };
      setActiveDiff({ hash, file, diff: data.diff ?? "", loading: false });
    } catch {
      setActiveDiff({ hash, file, diff: "", loading: false });
    }
  };

  const uncommittedCount = branchInfo?.files?.length ?? 0;

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "var(--bg)", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-dim)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Branch pill */}
          {branchInfo && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--text-dimmer)", fontSize: 10, fontFamily: "var(--font-ui)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Branch
              </span>
              <span style={{
                fontFamily: "var(--font)", fontSize: 12, color: "var(--accent)",
                background: "var(--accent-bg)", padding: "2px 8px",
                borderRadius: "var(--radius-sm)", border: "1px solid var(--accent-border)",
              }}>
                {branchInfo.branch}
              </span>

              {/* Ahead/behind */}
              {(branchInfo.ahead > 0 || branchInfo.behind > 0) && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {branchInfo.ahead > 0 && (
                    <span style={{
                      fontFamily: "var(--font)", fontSize: 11,
                      color: "var(--accent)", background: "var(--accent-bg)",
                      padding: "1px 6px", borderRadius: 100,
                      border: "1px solid var(--accent-border)",
                    }}>
                      ↑{branchInfo.ahead}
                    </span>
                  )}
                  {branchInfo.behind > 0 && (
                    <span style={{
                      fontFamily: "var(--font)", fontSize: 11,
                      color: "var(--yellow)", background: "rgba(210,153,34,0.1)",
                      padding: "1px 6px", borderRadius: 100,
                      border: "1px solid rgba(210,153,34,0.25)",
                    }}>
                      ↓{branchInfo.behind}
                    </span>
                  )}
                </div>
              )}

              {/* Uncommitted changes */}
              {uncommittedCount > 0 && (
                <span
                  onClick={() => navigate("/git")}
                  className="hoverable"
                  style={{
                    fontFamily: "var(--font-ui)", fontSize: 11,
                    color: "var(--yellow)", textDecoration: "none",
                    background: "rgba(210,153,34,0.08)",
                    padding: "1px 8px", borderRadius: 100,
                    border: "1px solid rgba(210,153,34,0.25)",
                  }}
                >
                  {uncommittedCount} uncommitted {uncommittedCount === 1 ? "change" : "changes"}
                </span>
              )}
            </div>
          )}

          {branchInfo?.error && (
            <span style={{ color: "var(--red)", fontSize: 11, fontFamily: "var(--font-ui)" }}>
              {branchInfo.error}
            </span>
          )}
        </div>

        <button onClick={load} className="btn btn-sm">
          Refresh
        </button>
      </div>

      {/* Body: timeline + optional diff panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Commit log */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "12px 16px",
          minWidth: 0,
        }}>
          {loading ? (
            <div style={{
              color: "var(--text-dimmer)", fontFamily: "var(--font-ui)",
              fontSize: 12, paddingTop: 8,
            }}>
              Loading commit history...
            </div>
          ) : !logData?.commits.length ? (
            <div style={{
              color: "var(--text-dimmer)", fontFamily: "var(--font-ui)",
              fontSize: 12, paddingTop: 8,
            }}>
              {logData?.error ?? "No commits found."}
            </div>
          ) : (
            <>
              <div style={{
                fontSize: 10, fontFamily: "var(--font-ui)", color: "var(--text-dimmer)",
                letterSpacing: "0.08em", textTransform: "uppercase",
                marginBottom: 12,
              }}>
                History — {logData.commits.length} commits
              </div>
              {logData.commits.map((commit, idx) => (
                <CommitRow
                  key={commit.hash}
                  commit={commit}
                  isLast={idx === logData.commits.length - 1}
                  expanded={expandedHashes.has(commit.hash)}
                  onToggle={() => toggleExpand(commit.hash)}
                  onFileClick={handleFileClick}
                  activeDiff={activeDiff}
                />
              ))}
            </>
          )}
        </div>

        {/* Diff panel */}
        {activeDiff && !activeDiff.loading && (
          <DiffPanel
            diff={activeDiff.diff}
            filename={activeDiff.file}
            onClose={() => setActiveDiff(null)}
          />
        )}
        {activeDiff && activeDiff.loading && (
          <div style={{
            width: "clamp(320px, 40vw, 680px)", flexShrink: 0,
            borderLeft: "1px solid var(--border-dim)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-dimmer)", fontFamily: "var(--font-ui)", fontSize: 12,
          }}>
            Loading diff...
          </div>
        )}
      </div>
    </div>
  );
}
