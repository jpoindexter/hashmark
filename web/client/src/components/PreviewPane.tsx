import { useState, useRef } from "react";

export function PreviewPane({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("http://localhost:3000");
  const [draft, setDraft] = useState(url);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const navigate = (target: string) => {
    let normalized = target.trim();
    if (normalized && !normalized.startsWith("http") && !normalized.startsWith("/")) {
      normalized = "http://" + normalized;
    }
    setUrl(normalized);
    setDraft(normalized);
    setReloadKey(k => k + 1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-panel)", borderLeft: "1px solid var(--border)" }}>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-elevated)" }}>
        <button onClick={() => setReloadKey(k => k + 1)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, padding: "2px 4px", lineHeight: 1 }} title="Reload">↻</button>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && navigate(draft)}
          onBlur={() => navigate(draft)}
          style={{ flex: 1, fontSize: 11, padding: "3px 8px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontFamily: "var(--font-mono)", outline: "none" }}
          spellCheck={false}
          placeholder="http://localhost:3000"
        />
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, padding: "2px 4px", lineHeight: 1 }} title="Close preview">×</button>
      </div>
      {/* iframe */}
      <iframe
        key={reloadKey}
        ref={iframeRef}
        src={url}
        style={{ flex: 1, border: "none" }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        title="Preview"
      />
    </div>
  );
}
