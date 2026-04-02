import { memo } from "react";
import { renderInline } from "../../lib/markdown";

const AssistantContent = memo(function AssistantContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={key++} style={{
          background: "var(--bg-3)",
          border: "1px solid var(--border-dim)",
          padding: "10px 12px",
          margin: "8px 0",
          overflow: "auto",
          fontSize: "11px",
          lineHeight: "1.5",
        }}>
          {lang && <div style={{ color: "var(--text-dimmer)", fontSize: "10px", marginBottom: "6px", textTransform: "uppercase" }}>{lang}</div>}
          <code style={{ color: "var(--text)", fontFamily: "var(--font)" }}>{codeLines.join("\n")}</code>
        </pre>
      );
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      nodes.push(<h4 key={key++} style={{ color: "var(--text)", fontSize: "12px", fontWeight: 600, margin: "12px 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{line.slice(4)}</h4>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h3 key={key++} style={{ color: "var(--text)", fontSize: "13px", fontWeight: 600, margin: "12px 0 4px" }}>{line.slice(3)}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(<h2 key={key++} style={{ color: "var(--accent)", fontSize: "14px", fontWeight: 600, margin: "12px 0 6px" }}>{line.slice(2)}</h2>);
      i++;
      continue;
    }

    if (line.match(/^[-*] /)) {
      nodes.push(
        <div key={key++} style={{ display: "flex", gap: "8px", margin: "2px 0" }}>
          <span style={{ color: "var(--accent)", flexShrink: 0 }}>›</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
      i++;
      continue;
    }

    if (!line.trim()) {
      nodes.push(<div key={key++} style={{ height: "6px" }} />);
      i++;
      continue;
    }

    nodes.push(
      <div key={key++} style={{ lineHeight: "1.6" }}>
        {renderInline(line)}
      </div>
    );
    i++;
  }

  return <>{nodes}</>;
});

export default AssistantContent;
