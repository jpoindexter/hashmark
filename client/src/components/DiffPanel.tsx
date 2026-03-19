interface DiffPanelProps {
  diff: string;
  filename?: string;
  onClose?: () => void;
  fullWidth?: boolean;
}

type LineType = "add" | "remove" | "hunk" | "header" | "context";

interface DiffLine {
  type: LineType;
  content: string;
  oldLine?: number;
  newLine?: number;
}

function parseDiff(diffText: string): DiffLine[] {
  const lines = diffText.split("\n");
  const result: DiffLine[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (const line of lines) {
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
      result.push({ type: "header", content: line });
    } else if (line.startsWith("@@")) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldNum = parseInt(m[1]) - 1;
        newNum = parseInt(m[2]) - 1;
      }
      result.push({ type: "hunk", content: line });
    } else if (line.startsWith("+")) {
      newNum++;
      result.push({ type: "add", content: line.slice(1), newLine: newNum });
    } else if (line.startsWith("-")) {
      oldNum++;
      result.push({ type: "remove", content: line.slice(1), oldLine: oldNum });
    } else if (line.startsWith(" ")) {
      oldNum++;
      newNum++;
      result.push({ type: "context", content: line.slice(1), oldLine: oldNum, newLine: newNum });
    }
  }

  return result;
}

const ROW_BG: Record<LineType, string> = {
  add:     "var(--accent-bg)",
  remove:  "var(--red-bg)",
  hunk:    "var(--surface-subtle)",
  header:  "transparent",
  context: "transparent",
};

const ROW_BORDER: Record<LineType, string | undefined> = {
  add:    "var(--accent)",
  remove: "var(--red)",
  hunk:   undefined,
  header: undefined,
  context: undefined,
};

const ROW_FG: Record<LineType, string> = {
  add:     "var(--accent)",
  remove:  "var(--red)",
  hunk:    "var(--text-dimmer)",
  header:  "var(--text-dimmer)",
  context: "var(--text-dim)",
};

function DiffRow({ line }: { line: DiffLine }) {
  const bg = ROW_BG[line.type];
  const borderColor = ROW_BORDER[line.type];
  const fg = ROW_FG[line.type];

  if (line.type === "header" || line.type === "hunk") {
    return (
      <tr style={{ background: bg }}>
        <td colSpan={3} style={{
          padding: "2px 12px",
          fontFamily: "var(--font, monospace)",
          fontSize: 11,
          color: fg,
          fontStyle: line.type === "hunk" ? "italic" : undefined,
          userSelect: "text",
        }}>
          {line.content}
        </td>
      </tr>
    );
  }

  const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

  return (
    <tr style={{
      background: bg,
      borderLeft: borderColor ? `2px solid ${borderColor}` : "2px solid transparent",
    }}>
      <td style={{
        width: 38, minWidth: 38,
        textAlign: "right",
        padding: "1px 6px",
        color: "var(--text-dimmer)",
        userSelect: "none",
        borderRight: "1px solid var(--border-dim)",
        fontFamily: "var(--font, monospace)",
        fontSize: 11,
      }}>
        {line.type !== "add" ? (line.oldLine ?? "") : ""}
      </td>
      <td style={{
        width: 38, minWidth: 38,
        textAlign: "right",
        padding: "1px 6px",
        color: "var(--text-dimmer)",
        userSelect: "none",
        borderRight: "1px solid var(--border-dim)",
        fontFamily: "var(--font, monospace)",
        fontSize: 11,
      }}>
        {line.type !== "remove" ? (line.newLine ?? "") : ""}
      </td>
      <td style={{
        padding: "1px 10px",
        color: fg,
        whiteSpace: "pre",
        fontFamily: "var(--font, monospace)",
        fontSize: 12,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        <span style={{ color: fg, marginRight: 8, userSelect: "none", opacity: 0.7 }}>{prefix}</span>
        {line.content}
      </td>
    </tr>
  );
}

export function DiffPanel({ diff, filename, onClose, fullWidth }: DiffPanelProps) {
  const panelWidth = fullWidth ? "100%" : "clamp(320px, 40vw, 680px)";
  const lines = parseDiff(diff);
  const isEmpty = lines.length === 0 || !diff.trim();

  return (
    <div style={{
      width: panelWidth,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
      borderLeft: fullWidth ? "none" : "1px solid var(--border-dim)",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {/* Sticky filename header */}
      <div style={{
        height: 36,
        minHeight: 36,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        background: "var(--bg-2)",
        borderBottom: "1px solid var(--border-dim)",
        flexShrink: 0,
        gap: 8,
      }}>
        <span style={{
          fontFamily: "var(--font, monospace)",
          fontSize: 11,
          color: "var(--text-dim)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {filename ?? "diff"}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-dimmer)",
              fontSize: 16,
              padding: "0 4px",
              lineHeight: 1,
              flexShrink: 0,
              transition: "color 0.1s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)"; }}
          >
            ×
          </button>
        )}
      </div>

      {/* Diff content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {isEmpty ? (
          <div style={{
            padding: 20,
            fontFamily: "var(--font, monospace)",
            fontSize: 12,
            color: "var(--text-dimmer)",
          }}>
            No diff available
          </div>
        ) : (
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}>
            <colgroup>
              <col style={{ width: 38 }} />
              <col style={{ width: 38 }} />
              <col />
            </colgroup>
            <tbody>
              {lines.map((line, i) => (
                <DiffRow key={i} line={line} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
