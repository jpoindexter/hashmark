import { useState, useEffect } from "react";
import { FileCode } from "lucide-react";

export default function FileContentViewer() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for file open events from FileTreeSidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (path) {
        setFilePath(path);
        setLoading(true);
        setError(null);
        fetch(`/api/files/read?path=${encodeURIComponent(path)}`)
          .then(r => {
            if (!r.ok) throw new Error("Failed to load file");
            return r.json();
          })
          .then((d: { content?: string }) => {
            setContent(d.content ?? "");
            setLoading(false);
            // Track in recent files
            try {
              const key = "studio:recent_files";
              const recent = JSON.parse(localStorage.getItem(key) || "[]") as string[];
              const updated = [path, ...recent.filter(f => f !== path)].slice(0, 10);
              localStorage.setItem(key, JSON.stringify(updated));
            } catch {}
          })
          .catch(err => {
            setError(err instanceof Error ? err.message : "Failed to load");
            setLoading(false);
          });
      }
    };
    window.addEventListener("studio:open-file", handler);
    return () => window.removeEventListener("studio:open-file", handler);
  }, []);

  if (!filePath) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-dimmer)", fontSize: 13, fontFamily: "var(--font-ui)",
      }}>
        Select a file to view its contents.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* File path breadcrumb */}
      <div style={{
        height: 32, flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
        padding: "0 12px", borderBottom: "1px solid var(--border-dim)",
        fontSize: 12, fontFamily: "var(--font)", color: "var(--text-dim)",
      }}>
        <FileCode size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {filePath}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
        {loading ? (
          <div style={{ padding: "20px 16px", color: "var(--text-dimmer)", fontSize: 12 }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: "20px 16px", color: "var(--red)", fontSize: 12 }}>{error}</div>
        ) : (
          <pre style={{
            margin: 0, padding: "0 16px", fontSize: 13, fontFamily: "var(--font)",
            color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {content.split("\n").map((line, i) => (
              <div key={i} style={{ display: "flex", minHeight: 20 }}>
                <span style={{
                  width: 48, flexShrink: 0, textAlign: "right", paddingRight: 12,
                  color: "var(--text-dimmer)", userSelect: "none", fontSize: 12,
                }}>
                  {i + 1}
                </span>
                <span>{line || " "}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
