import { useState, useEffect } from "react";
import { GitCompare } from "lucide-react";
import { fetchApi } from "../../lib/api";

export default function DiffContentViewer() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fileStatus, setFileStatus] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string | { path: string }>).detail;
      const path = typeof detail === "string" ? detail : detail?.path;
      if (path) {
        setFilePath(path);
        setLoading(true);
        setFileStatus(null);
        fetchApi(`/api/files/diff?path=${encodeURIComponent(path)}`)
          .then(r => r.json())
          .then((d: { diff?: string; status?: string }) => {
            setDiff(d.diff ?? "");
            setFileStatus(d.status ?? null);
            setLoading(false);
          })
          .catch(() => { setDiff(""); setFileStatus("error"); setLoading(false); });
      }
    };
    window.addEventListener("studio:open-diff", handler);
    return () => window.removeEventListener("studio:open-diff", handler);
  }, []);

  if (!filePath) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-dimmer)", fontSize: 13, fontFamily: "var(--font-ui)",
      }}>
        Select a file to view its diff.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{
        height: 32, flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
        padding: "0 12px", borderBottom: "1px solid var(--border-dim)",
        fontSize: 12, fontFamily: "var(--font)", color: "var(--text-dim)",
      }}>
        <GitCompare size={14} style={{ color: "var(--blue)", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {filePath}
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto", fontFamily: "var(--font)", fontSize: 12, lineHeight: 1.5 }}>
        {loading ? (
          <div style={{ padding: "20px 16px", color: "var(--text-dimmer)" }}>Loading...</div>
        ) : diff ? (
          diff.split("\n").map((line, i) => (
            <div key={i} style={{
              padding: "0 12px", minHeight: 20,
              background: line.startsWith("+") && !line.startsWith("+++") ? "var(--accent-bg)"
                : line.startsWith("-") && !line.startsWith("---") ? "var(--red-bg)" : "transparent",
              color: line.startsWith("+") && !line.startsWith("+++") ? "var(--accent)"
                : line.startsWith("-") && !line.startsWith("---") ? "var(--red)"
                : line.startsWith("@@") ? "var(--blue)" : "var(--text-dim)",
            }}>
              {line || "\u00a0"}
            </div>
          ))
        ) : (
          <div style={{ padding: "20px 16px", color: "var(--text-dimmer)" }}>
            {fileStatus === "D" ? "File deleted — no diff available against HEAD."
              : fileStatus === "error" ? "Failed to load diff."
              : fileStatus === "?" ? "Untracked file — no previous version to diff against."
              : "No changes."}
          </div>
        )}
      </div>
    </div>
  );
}
