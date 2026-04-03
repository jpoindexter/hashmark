import { useState } from "react";

export const CODE_CONTAINER_STYLE: React.CSSProperties = {
  background: "var(--muted)",
  borderRadius: "var(--radius)",
  margin: "8px 0",
  overflow: "hidden",
  position: "relative",
  maxHeight: 500,
};

export const CODE_ACTIONS_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 8,
  display: "flex",
  gap: 4,
  zIndex: 2,
  opacity: 0,
  transition: "opacity 0.15s",
};

export const LANG_BADGE_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "var(--font)",
  letterSpacing: "0.06em",
  color: "var(--text-dimmer)",
  background: "var(--bg-3)",
  padding: "1px 6px",
  borderRadius: "var(--radius-sm)",
  textTransform: "uppercase",
};

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("---") || line.startsWith("+++"))
    return <div style={{ color: "var(--text-dimmer)", fontStyle: "italic" }}>{line}</div>;
  if (line.startsWith("@@"))
    return <div style={{ color: "var(--blue)" }}>{line}</div>;
  if (line.startsWith("+"))
    return <div style={{ background: "var(--green-bg)", color: "var(--green)" }}>{line}</div>;
  if (line.startsWith("-"))
    return <div style={{ background: "var(--red-bg)", color: "var(--red)" }}>{line}</div>;
  return <div style={{ color: "var(--text-dim)" }}>{line}</div>;
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} className="hoverable"
      style={{ fontSize: 10, fontFamily: "var(--font-ui)", color: copied ? "var(--accent)" : "var(--text-dim)", background: "var(--bg-3)", border: "1px solid var(--border-dim)", padding: "2px 8px", cursor: "pointer", userSelect: "none", borderRadius: "var(--radius-sm)" }}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const isDiff = lang === "diff";
  return (
    <div
      style={CODE_CONTAINER_STYLE}
      onMouseEnter={(e) => {
        const actions = e.currentTarget.querySelector("[data-actions]") as HTMLElement | null;
        if (actions) actions.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        const actions = e.currentTarget.querySelector("[data-actions]") as HTMLElement | null;
        if (actions) actions.style.opacity = "0";
      }}
    >
      <div data-actions style={CODE_ACTIONS_STYLE}>
        {(lang || isDiff) && <span style={LANG_BADGE_STYLE}>{isDiff ? "DIFF" : lang}</span>}
        <CopyButton text={code} />
      </div>
      <pre style={{
        padding: "10px 12px", overflow: "auto", maxHeight: 480,
        fontSize: 12, lineHeight: 1.5, margin: 0, fontFamily: "var(--font)",
      }}>
        {isDiff ? (
          code.split("\n").map((line, i) => <DiffLine key={i} line={line} />)
        ) : (
          <code style={{ color: "var(--text)" }}>{code}</code>
        )}
      </pre>
    </div>
  );
}
