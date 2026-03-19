import { useState, useEffect } from "react";
import { highlightCode, getLanguageFromPath } from "../lib/highlight";

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

export function CodeViewer({ content, ext, path }: CodeViewerProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");

  useEffect(() => {
    if (!content || isBinary(content)) return;
    let cancelled = false;
    const lang = path ? getLanguageFromPath(path) : ext;
    highlightCode(content, lang)
      .then((html) => {
        if (!cancelled) setHighlightedHtml(html);
      })
      .catch(() => {
        if (!cancelled) setHighlightedHtml("");
      });
    return () => {
      cancelled = true;
    };
  }, [content, ext, path]);

  if (isBinary(content)) {
    return (
      <div
        style={{
          padding: 24,
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          fontSize: 12,
        }}
      >
        Binary file -- cannot display
      </div>
    );
  }

  if (highlightedHtml) {
    return (
      <div
        className="shiki-viewer"
        /* Shiki HTML is generated from source code by a trusted library, safe to render */
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        style={{
          fontFamily: "var(--font)",
          fontSize: 12,
          lineHeight: 1.6,
          overflow: "auto",
          height: "100%",
          background: "var(--bg)",
          padding: "8px 0",
        }}
      />
    );
  }

  // Plain text fallback while Shiki loads
  const lines = content.split("\n");
  return (
    <div
      style={{
        fontFamily: "var(--font)",
        fontSize: 12,
        lineHeight: 1.6,
        overflow: "auto",
        height: "100%",
        background: "var(--bg)",
        padding: "8px 0",
      }}
    >
      {lines.map((line, idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            minWidth: "max-content",
            paddingRight: 24,
          }}
        >
          <span
            style={{
              width: 44,
              minWidth: 44,
              textAlign: "right",
              paddingRight: 16,
              color: "var(--text-dimmer)",
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            {idx + 1}
          </span>
          <span style={{ whiteSpace: "pre", color: "var(--text-dim)" }}>
            {line || " "}
          </span>
        </div>
      ))}
    </div>
  );
}
