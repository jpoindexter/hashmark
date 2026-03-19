import { useMemo } from "react";

interface AgentFiles {
  id: string;
  name: string;
  files: string[];
}

interface ConflictEntry {
  file: string;
  agents: string[];
  severity?: "high" | "medium" | "low";
}

interface DependencyGraphProps {
  agents: AgentFiles[];
  conflicts: ConflictEntry[];
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "var(--red)",
  medium: "var(--yellow)",
  low: "var(--text-dimmer)",
};

export default function DependencyGraph({ agents, conflicts }: DependencyGraphProps) {
  const conflictMap = useMemo(() => {
    const m = new Map<string, ConflictEntry>();
    for (const c of conflicts) m.set(c.file, c);
    return m;
  }, [conflicts]);

  // Collect all unique files across all agents, conflict files first
  const allFiles = useMemo(() => {
    const fileSet = new Set<string>();
    for (const agent of agents) {
      for (const f of agent.files) fileSet.add(f);
    }
    const files = [...fileSet];
    // Sort: conflicting files first (by severity), then alphabetical
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    files.sort((a, b) => {
      const ca = conflictMap.get(a);
      const cb = conflictMap.get(b);
      if (ca && !cb) return -1;
      if (!ca && cb) return 1;
      if (ca && cb) {
        const sa = severityOrder[ca.severity ?? "medium"] ?? 1;
        const sb = severityOrder[cb.severity ?? "medium"] ?? 1;
        if (sa !== sb) return sa - sb;
      }
      return a.localeCompare(b);
    });
    return files;
  }, [agents, conflictMap]);

  // Build a quick lookup: agentId -> Set<file>
  const agentFileMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const agent of agents) {
      m.set(agent.id, new Set(agent.files));
    }
    return m;
  }, [agents]);

  if (agents.length === 0 || allFiles.length === 0) {
    return (
      <div style={{
        padding: "20px 16px",
        fontSize: 11,
        color: "var(--text-dimmer)",
        textAlign: "center",
        border: "1px dashed var(--border-dim)",
        borderRadius: "var(--radius)",
      }}>
        No file dependencies detected yet -- agents need output with file paths to populate this view
      </div>
    );
  }

  const conflictCount = conflicts.length;
  const highCount = conflicts.filter(c => c.severity === "high").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Summary bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 10,
        color: "var(--text-dimmer)",
        letterSpacing: "0.05em",
      }}>
        <span>{allFiles.length} file{allFiles.length !== 1 ? "s" : ""}</span>
        <span>{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
        {conflictCount > 0 ? (
          <span style={{ color: "var(--red)" }}>
            {conflictCount} conflict{conflictCount !== 1 ? "s" : ""}
            {highCount > 0 && ` (${highCount} high)`}
          </span>
        ) : (
          <span style={{ color: "var(--accent)" }}>no conflicts</span>
        )}
      </div>

      {/* Matrix */}
      <div style={{ overflowX: "auto" }}>
        <table style={{
          borderCollapse: "collapse",
          width: "100%",
          fontFamily: "var(--font)",
          fontSize: 10,
        }}>
          {/* Header row: agent names */}
          <thead>
            <tr>
              <th style={{
                textAlign: "left",
                padding: "6px 10px",
                borderBottom: "1px solid var(--border-dim)",
                color: "var(--text-dimmer)",
                fontWeight: 400,
                fontSize: 9,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                position: "sticky",
                left: 0,
                background: "var(--bg)",
                zIndex: 1,
                minWidth: 180,
              }}>
                FILE
              </th>
              {agents.map((agent) => (
                <th
                  key={agent.id}
                  style={{
                    textAlign: "center",
                    padding: "6px 8px",
                    borderBottom: "1px solid var(--border-dim)",
                    color: "var(--accent)",
                    fontWeight: 600,
                    fontSize: 9,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    minWidth: 70,
                  }}
                >
                  {agent.name.length > 14 ? agent.name.slice(0, 12) + ".." : agent.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {allFiles.map((file) => {
              const conflict = conflictMap.get(file);
              const isConflict = !!conflict;
              const severity = conflict?.severity ?? "medium";
              const rowBg = isConflict
                ? severity === "high"
                  ? "rgba(239,68,68,0.06)"
                  : "rgba(234,179,8,0.04)"
                : "transparent";

              return (
                <tr key={file} style={{ background: rowBg }}>
                  {/* File path cell */}
                  <td style={{
                    padding: "4px 10px",
                    borderBottom: "1px solid var(--border-dim)",
                    color: isConflict ? SEVERITY_COLORS[severity] : "var(--text-dim)",
                    fontWeight: isConflict ? 600 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 260,
                    position: "sticky",
                    left: 0,
                    background: isConflict
                      ? severity === "high"
                        ? "rgba(239,68,68,0.06)"
                        : "rgba(234,179,8,0.04)"
                      : "var(--bg)",
                    zIndex: 1,
                  }}
                    title={file}
                  >
                    {isConflict && (
                      <span style={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: SEVERITY_COLORS[severity],
                        marginRight: 6,
                        verticalAlign: "middle",
                        flexShrink: 0,
                      }} />
                    )}
                    {shortenPath(file)}
                  </td>

                  {/* Intersection cells */}
                  {agents.map((agent) => {
                    const touches = agentFileMap.get(agent.id)?.has(file) ?? false;
                    const isConflictCell = isConflict && touches;

                    return (
                      <td
                        key={agent.id}
                        style={{
                          textAlign: "center",
                          padding: "4px 8px",
                          borderBottom: "1px solid var(--border-dim)",
                        }}
                      >
                        {touches && (
                          <span style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: isConflictCell
                              ? SEVERITY_COLORS[severity]
                              : "var(--accent)",
                            opacity: isConflictCell ? 1 : 0.5,
                            ...(isConflictCell && severity === "high" ? {
                              boxShadow: `0 0 6px ${SEVERITY_COLORS[severity]}`,
                            } : {}),
                          }} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Conflict detail list */}
      {conflicts.length > 0 && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "8px 10px",
          background: "var(--bg-2)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
        }}>
          <div style={{
            fontSize: 9,
            color: "var(--text-dimmer)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 2,
          }}>
            CONFLICT DETAILS
          </div>
          {conflicts.map((c) => (
            <div key={c.file} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 10,
              lineHeight: 1.6,
            }}>
              <span style={{
                fontSize: 8,
                letterSpacing: "0.06em",
                color: SEVERITY_COLORS[c.severity ?? "medium"],
                border: `1px solid ${SEVERITY_COLORS[c.severity ?? "medium"]}`,
                padding: "0px 4px",
                lineHeight: "14px",
                flexShrink: 0,
              }}>
                {(c.severity ?? "medium").toUpperCase()}
              </span>
              <span style={{ color: "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.file}>
                {c.file}
              </span>
              <span style={{ color: "var(--text-dimmer)", flexShrink: 0 }}>
                {c.agents.length} agents
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Shorten a file path for display: keep filename and 1-2 parent dirs.
 * e.g. "src/components/dashboard/RepoCard.tsx" -> "dashboard/RepoCard.tsx"
 */
function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return "..." + "/" + parts.slice(-2).join("/");
}
