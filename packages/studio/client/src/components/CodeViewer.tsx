import { getLang, tokenizeLine, TOKEN_COLORS } from "../lib/highlight";

interface CodeViewerProps {
  content: string;
  ext: string;
  path?: string;
}

function isBinary(content: string): boolean {
  for (let i = 0; i < Math.min(content.length, 512); i++) {
    const code = content.charCodeAt(i);
    if (code === 0) return true;
  }
  return false;
}

function renderMarkdownLine(line: string, idx: number) {
  const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const sizes = [20, 17, 15, 13, 12, 12];
    return (
      <div key={idx} style={{
        fontSize: sizes[level - 1],
        fontWeight: 700,
        color: level === 1 ? "var(--accent)" : "var(--text)",
        marginTop: level <= 2 ? 16 : 8,
        marginBottom: 4,
        fontFamily: "var(--font)",
      }}>
        {headingMatch[2]}
      </div>
    );
  }

  if (/^[-*]\s/.test(line)) {
    return (
      <div key={idx} style={{ color: "var(--text-dim)", lineHeight: 1.7, fontFamily: "var(--font)", fontSize: 12 }}>
        {"  • " + line.slice(2)}
      </div>
    );
  }

  return (
    <div key={idx} style={{ color: "var(--text-dim)", lineHeight: 1.7, minHeight: 24, fontFamily: "var(--font)", fontSize: 12 }}>
      {line || " "}
    </div>
  );
}

export function CodeViewer({ content, ext, path: _path }: CodeViewerProps) {
  if (isBinary(content)) {
    return (
      <div style={{
        padding: 24,
        color: "var(--text-dimmer)",
        fontFamily: "var(--font)",
        fontSize: 12,
      }}>
        Binary file — cannot display
      </div>
    );
  }

  const lang = getLang(ext);
  const lines = content.split("\n");

  if (lang === "md") {
    return (
      <div style={{
        padding: "16px 24px",
        overflow: "auto",
        height: "100%",
        background: "var(--bg)",
      }}>
        {lines.map((line, idx) => renderMarkdownLine(line, idx))}
      </div>
    );
  }

  const shouldHighlight = lang === "ts" || lang === "js" || lang === "json";
  let inBlockComment = false;

  return (
    <div style={{
      fontFamily: "var(--font)",
      fontSize: 12,
      lineHeight: 1.6,
      overflow: "auto",
      height: "100%",
      background: "var(--bg)",
      padding: "8px 0",
    }}>
      {lines.map((line, idx) => {
        if (line.includes("/*")) inBlockComment = true;
        const isBlockComment = inBlockComment;
        if (line.includes("*/")) inBlockComment = false;

        const tokens = (shouldHighlight && !isBlockComment)
          ? tokenizeLine(line)
          : [{ type: "comment" as const, value: line }];

        return (
          <div
            key={idx}
            style={{ display: "flex", minWidth: "max-content", paddingRight: 24 }}
          >
            <span style={{
              width: 44,
              minWidth: 44,
              textAlign: "right",
              paddingRight: 16,
              color: "#3f3f46",
              userSelect: "none",
              flexShrink: 0,
            }}>
              {idx + 1}
            </span>
            <span style={{ whiteSpace: "pre" }}>
              {tokens.map((tok, ti) => (
                <span key={ti} style={{ color: TOKEN_COLORS[tok.type] }}>
                  {tok.value}
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
