import { useState } from "react";

export const CODE_CONTAINER_STYLE: React.CSSProperties = {
  background: "var(--bg-2)",
  border: "1px solid var(--border-dim)",
  borderRadius: "var(--radius-lg)",
  margin: "8px 0",
  overflow: "hidden",
  position: "relative",
};

export const CODE_ACTIONS_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 4,
  right: 6,
  display: "flex",
  gap: 4,
  zIndex: 2,
};

export const LANG_BADGE_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "var(--font)",
  letterSpacing: "0.06em",
  color: "var(--text-dimmer)",
  background: "var(--bg-4)",
  padding: "1px 6px",
  borderRadius: "var(--radius-sm)",
  textTransform: "uppercase",
};

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("---") || line.startsWith("+++"))
    return <div style={{ color: "var(--text-dimmer)", fontStyle: "italic" }}>{line}</div>;
  if (line.startsWith("@@"))
    return <div style={{ color: "var(--blue, #388bfd)" }}>{line}</div>;
  if (line.startsWith("+"))
    return <div style={{ background: "var(--accent-bg, rgba(63,185,80,0.1))", color: "var(--accent)" }}>{line}</div>;
  if (line.startsWith("-"))
    return <div style={{ background: "var(--red-bg, rgba(248,81,73,0.1))", color: "var(--red, #f85149)" }}>{line}</div>;
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
      style={{ fontSize: "10px", fontFamily: "var(--font-ui)", color: copied ? "var(--accent)" : "var(--text-dim)", background: "var(--bg-3)", border: "1px solid var(--border-dim)", padding: "1px 6px", cursor: "pointer", userSelect: "none", lineHeight: 1.4, transition: "background 0.1s, color 0.1s" }}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const isDiff = lang === "diff";
  return (
    <div style={CODE_CONTAINER_STYLE}>
      <div style={CODE_ACTIONS_STYLE}>
        {(lang || isDiff) && <span style={LANG_BADGE_STYLE}>{isDiff ? "DIFF" : lang}</span>}
        <CopyButton text={code} />
      </div>
      <pre style={{ padding: "28px 12px 10px", overflow: "auto", fontSize: "11px", lineHeight: "1.5", margin: 0, fontFamily: isDiff ? "var(--font)" : undefined }}>
        {isDiff ? (
          code.split("\n").map((line, i) => <DiffLine key={i} line={line} />)
        ) : (
          <code style={{ color: "var(--text)", fontFamily: "var(--font)" }}>{code}</code>
        )}
      </pre>
    </div>
  );
}
