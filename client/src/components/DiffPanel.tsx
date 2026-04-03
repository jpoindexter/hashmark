import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { FileText, FilePlus, FileX, FilePen, Columns2, AlignLeft, X, RotateCcw } from "lucide-react";
import { fetchApi } from "../lib/api";

const MonacoDiffEditor = lazy(() => import("./MonacoDiffEditor"));

interface DiffFile { path: string; status: string; added: number; removed: number; }

function statusIcon(s: string) {
  if (s.includes("A") || s.includes("?")) return <FilePlus size={12} style={{ color: "var(--green)" }} />;
  if (s.includes("D")) return <FileX size={12} style={{ color: "var(--red)" }} />;
  if (s.includes("M")) return <FilePen size={12} style={{ color: "var(--yellow)" }} />;
  return <FileText size={12} style={{ color: "var(--text-dimmer)" }} />;
}

function getLang(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  const m: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", py: "python", rs: "rust", go: "go", css: "css", html: "html", json: "json", md: "markdown", yaml: "yaml", yml: "yaml", sql: "sql", sh: "shell" };
  return m[ext] ?? "plaintext";
}

export default function DiffPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [orig, setOrig] = useState("");
  const [mod, setMod] = useState("");
  const [sbs, setSbs] = useState(true);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    fetchApi("/api/files/git").then(r => r.json()).then((d: { files?: Array<{ path?: string; file?: string; status: string; added: number; removed: number }> }) => {
      const changed = (d.files ?? []).map(f => ({ ...f, path: f.path ?? f.file ?? "" })).filter(f => f.path && !f.status.includes("?"));
      setFiles(changed);
      if (changed.length > 0 && !sel) setSel(changed[0].path);
    }).catch(() => {});
  }, [sel]);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  useEffect(() => {
    if (!sel) { setOrig(""); setMod(""); return; }
    setLoading(true);
    Promise.all([
      fetchApi(`/api/files/content?path=${encodeURIComponent(sel)}&ref=HEAD`).then(r => r.ok ? r.text() : "").catch(() => ""),
      fetchApi(`/api/files/content?path=${encodeURIComponent(sel)}`).then(r => r.ok ? r.text() : "").catch(() => ""),
    ]).then(([o, m]) => { setOrig(o); setMod(m); setLoading(false); });
  }, [sel]);

  if (!open) return null;

  return (
    <div style={{ width: 480, borderLeft: "1px solid var(--border-dim)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", background: "var(--bg)" }}>
      <div style={{ height: 34, borderBottom: "1px solid var(--border-dim)", display: "flex", alignItems: "center", padding: "0 10px", gap: 6, flexShrink: 0 }}>
        <span className="label" style={{ flex: 1 }}>Changes</span>
        <button className="btn-icon" title={sbs ? "Unified" : "Side-by-side"} onClick={() => setSbs(v => !v)}>{sbs ? <AlignLeft size={13} /> : <Columns2 size={13} />}</button>
        <button className="btn-icon" title="Refresh" onClick={reload}><RotateCcw size={12} /></button>
        <button className="btn-icon" title="Close" onClick={onClose}><X size={13} /></button>
      </div>
      <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid var(--border-dim)", flexShrink: 0 }}>
        {files.map(f => (
          <button key={f.path} className="hoverable" onClick={() => setSel(f.path)} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", fontSize: 11,
            color: sel === f.path ? "var(--text)" : "var(--text-dim)",
            borderBottom: sel === f.path ? "2px solid var(--accent)" : "2px solid transparent",
            whiteSpace: "nowrap", background: "none", border: "none", cursor: "pointer",
          }}>
            {statusIcon(f.status)} {f.path.split("/").pop()}
            {(f.added > 0 || f.removed > 0) && <span style={{ fontSize: 10 }}>{f.added > 0 && <span style={{ color: "var(--green)" }}>+{f.added}</span>}{f.removed > 0 && <span style={{ color: "var(--red)", marginLeft: 2 }}>-{f.removed}</span>}</span>}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {loading ? <div style={{ padding: 20, color: "var(--text-dimmer)", fontSize: 12 }}>Loading...</div>
        : sel ? <Suspense fallback={<div style={{ padding: 20, color: "var(--text-dimmer)", fontSize: 12 }}>Loading editor...</div>}><MonacoDiffEditor original={orig} modified={mod} language={getLang(sel)} sideBySide={sbs} /></Suspense>
        : <div style={{ padding: 20, color: "var(--text-dimmer)", fontSize: 12, textAlign: "center" }}>No file selected</div>}
      </div>
    </div>
  );
}
