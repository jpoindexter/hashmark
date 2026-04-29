import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      style={{
        position: "absolute", top: 6, right: 6,
        fontSize: 10, padding: "2px 8px",
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", cursor: "pointer",
        color: copied ? "var(--green)" : "var(--text-muted)",
        transition: "color 150ms",
        fontFamily: "var(--font-sans)",
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          p({ children }) {
            return <p style={{ margin: "0 0 8px", lineHeight: 1.65, color: "var(--text)", fontSize: 13 }}>{children}</p>;
          },
          h1({ children }) {
            return <h1 style={{ fontSize: 16, fontWeight: 700, margin: "14px 0 6px", color: "var(--text)", lineHeight: 1.3 }}>{children}</h1>;
          },
          h2({ children }) {
            return <h2 style={{ fontSize: 14, fontWeight: 700, margin: "12px 0 5px", color: "var(--text)", lineHeight: 1.3 }}>{children}</h2>;
          },
          h3({ children }) {
            return <h3 style={{ fontSize: 13, fontWeight: 600, margin: "10px 0 4px", color: "var(--text-dim)", lineHeight: 1.3 }}>{children}</h3>;
          },
          h4({ children }) {
            return <h4 style={{ fontSize: 12, fontWeight: 600, margin: "8px 0 3px", color: "var(--text-dim)", lineHeight: 1.3 }}>{children}</h4>;
          },
          ul({ children }) {
            return <ul style={{ margin: "4px 0 8px", paddingLeft: 18, color: "var(--text)" }}>{children}</ul>;
          },
          ol({ children }) {
            return <ol style={{ margin: "4px 0 8px", paddingLeft: 18, color: "var(--text)" }}>{children}</ol>;
          },
          li({ children }) {
            return <li style={{ margin: "2px 0", lineHeight: 1.6, fontSize: 13 }}>{children}</li>;
          },
          hr() {
            return <hr style={{ border: "none", height: 1, background: "var(--border)", margin: "10px 0" }} />;
          },
          pre({ children }) {
            const codeEl = children as React.ReactElement<{ children?: string }>;
            const rawText = codeEl?.props?.children ?? "";
            return (
              <div style={{ position: "relative", margin: "6px 0" }}>
                <pre style={{
                  background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)", padding: "10px 12px",
                  fontSize: 12, overflowX: "auto",
                  fontFamily: "var(--font-mono)", lineHeight: 1.6,
                  margin: 0,
                }}>
                  {children}
                </pre>
                <CopyBtn text={String(rawText)} />
              </div>
            );
          },
          code({ children, className }) {
            const isInline = !className;
            if (isInline) {
              return (
                <code style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.88em",
                  background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)",
                  padding: "1px 5px", color: "var(--accent-text)",
                  border: "1px solid var(--border)",
                }}>
                  {children}
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          },
          a({ href, children }) {
            return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-text)", textDecoration: "underline", textDecorationColor: "var(--border-focus)", textUnderlineOffset: 2 }}>{children}</a>;
          },
          strong({ children }) {
            return <strong style={{ fontWeight: 600, color: "var(--text)" }}>{children}</strong>;
          },
          em({ children }) {
            return <em style={{ fontStyle: "italic", color: "var(--text-dim)" }}>{children}</em>;
          },
          blockquote({ children }) {
            return (
              <blockquote style={{
                borderLeft: "3px solid var(--border-focus)", margin: "8px 0",
                paddingLeft: 12, color: "var(--text-dim)", fontStyle: "italic",
              }}>
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div style={{ overflowX: "auto", margin: "8px 0" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th style={{ padding: "5px 10px", borderBottom: "2px solid var(--border)", textAlign: "left", color: "var(--text-dim)", fontWeight: 600, fontSize: 11 }}>{children}</th>;
          },
          td({ children }) {
            return <td style={{ padding: "4px 10px", borderBottom: "1px solid var(--border)", color: "var(--text)", fontSize: 12 }}>{children}</td>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
