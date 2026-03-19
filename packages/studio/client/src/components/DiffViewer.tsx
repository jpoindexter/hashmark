import { useState, useEffect } from "react";

interface DiffViewerProps {
  path: string;
  staged?: boolean;
  onClose?: () => void;
}

interface DiffLine {
  type: "header" | "hunk" | "add" | "remove" | "context" | "meta";
  content: string;
  oldLine?: number;
  newLine?: number;
}

function parseDiff(diffText: string): DiffLine[] {
  const lines = diffText.split("\n");
  const result: DiffLine[] = [];
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    if (line.startsWith("---") || line.startsWith("+++")) {
      result.push({ type: "header", content: line });
    } else if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1]) - 1;
        newLineNum = parseInt(match[2]) - 1;
      }
      result.push({ type: "hunk", content: line });
    } else if (line.startsWith("+")) {
      newLineNum++;
      result.push({ type: "add", content: line.slice(1), newLine: newLineNum });
    } else if (line.startsWith("-")) {
      oldLineNum++;
      result.push({ type: "remove", content: line.slice(1), oldLine: oldLineNum });
    } else if (line.startsWith(" ")) {
      oldLineNum++;
      newLineNum++;
      result.push({ type: "context", content: line.slice(1), oldLine: oldLineNum, newLine: newLineNum });
    }
  }

  return result;
}

const BG: Record<string, string> = {
  add: "var(--accent-bg)",
  remove: "var(--red-bg)",
  hunk: "var(--bg-3)",
  header: "var(--bg-2)",
  context: "transparent",
  meta: "transparent",
};

const FG: Record<string, string> = {
  add: "var(--accent)",
  remove: "var(--red)",
  hunk: "var(--text-dim)",
  header: "var(--text-dimmer)",
  context: "var(--text)",
  meta: "var(--text-dimmer)",
};

function DiffRow({ line, index }: { line: DiffLine; index: number }) {
  if (line.type === "header" || line.type === "hunk" || line.type === "meta") {
    return (
      <tr key={index} style={{ background: BG[line.type] }}>
        <td colSpan={3} style={{
          padding: "2px 12px",
          color: FG[line.type],
          fontSize: line.type === "header" ? 11 : 12,
          userSelect: "text",
          fontFamily: "var(--font)",
        }}>
          {line.content}
        </td>
      </tr>
    );
  }

  const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

  return (
    <tr style={{ background: BG[line.type] }}>
      <td style={{
        width: 40, textAlign: "right", padding: "1px 8px",
        color: "var(--text-dimmer)", userSelect: "none",
        borderRight: "1px solid var(--border-dim)",
        fontFamily: "var(--font)", fontSize: 11,
      }}>
        {line.type !== "add" ? (line.oldLine ?? "") : ""}
      </td>
      <td style={{
        width: 40, textAlign: "right", padding: "1px 8px",
        color: "var(--text-dimmer)", userSelect: "none",
        borderRight: "1px solid var(--border-dim)",
        fontFamily: "var(--font)", fontSize: 11,
      }}>
        {line.type !== "remove" ? (line.newLine ?? "") : ""}
      </td>
      <td style={{
        padding: "1px 8px",
        color: FG[line.type] ?? "var(--text)",
        whiteSpace: "pre",
        fontFamily: "var(--font)", fontSize: 12,
      }}>
        <span style={{ color: FG[line.type], marginRight: 8, userSelect: "none" }}>{prefix}</span>
        {line.content}
      </td>
    </tr>
  );
}

export function DiffViewer({ path, staged = false, onClose }: DiffViewerProps) {
  const [diff, setDiff] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = `/api/files/diff?path=${encodeURIComponent(path)}&staged=${staged}`;
    fetch(url)
      .then(r => r.json())
      .then((d: { diff?: string; error?: string }) => {
        setDiff(d.diff ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load diff");
        setLoading(false);
      });
  }, [path, staged]);

  const monoMuted: React.CSSProperties = {
    color: "var(--text-dimmer)",
    padding: 16,
    fontFamily: "var(--font)",
    fontSize: 13,
  };

  if (loading) return <div style={monoMuted}>Loading diff...</div>;
  if (error) return <div style={{ ...monoMuted, color: "var(--red)" }}>{error}</div>;
  if (!diff) return <div style={monoMuted}>No changes in this file</div>;

  const lines = parseDiff(diff);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--bg)",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 12px",
        borderBottom: "1px solid var(--border-dim)",
        background: "var(--bg-2)",
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: "var(--font)",
          fontSize: 11,
          color: "var(--text-dim)",
        }}>
          {path}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-dimmer)",
              cursor: "pointer",
              fontFamily: "var(--font)",
              fontSize: 14,
              padding: "2px 6px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font)",
          fontSize: 12,
        }}>
          <tbody>
            {lines.map((line, i) => (
              <DiffRow key={i} line={line} index={i} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
