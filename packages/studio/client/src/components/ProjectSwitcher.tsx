import { useState, useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";

export default function ProjectSwitcher({ projectName }: { projectName: string | null }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    window.studio?.getRecentProjects?.().then(r => setRecent(r ?? [])).catch(() => {});
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const openRecent = async (path: string) => { setOpen(false); await window.studio?.setProjectDir(path); };
  const pickFolder = async () => { setOpen(false); const d = await window.studio?.pickFolder(); if (d) await window.studio?.setProjectDir(d); };

  const lastName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

  return (
    <div ref={ref} style={{ position: "relative", height: "100%", display: "flex", alignItems: "center" }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "2px 8px", height: 22, borderRadius: 3,
          background: open ? "var(--active-bg)" : "transparent",
          cursor: "pointer", fontSize: 11, color: "var(--text-dim)",
          transition: "background 0.1s", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--active-bg)"}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        {projectName ?? "project"}
        <ChevronRight size={10} style={{ transform: open ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.1s", opacity: 0.5 }} />
      </div>

      {open && (
        <div style={{
          position: "fixed", bottom: 38, right: 8,
          zIndex: 9999,
          background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6,
          minWidth: 280, maxWidth: 380,
          overflow: "hidden",
        }}>
          {recent.length > 0 && (
            <>
              <div style={{ padding: "6px 12px 4px", fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.08em" }}>
                RECENT PROJECTS
              </div>
              {recent.map(path => (
                <div
                  key={path}
                  onClick={() => void openRecent(path)}
                  style={{ display: "flex", flexDirection: "column", padding: "6px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-dim)", transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--accent-bg)"}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{lastName(path)}</span>
                  <span style={{ fontSize: 10, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
                </div>
              ))}
            </>
          )}
          <div
            onClick={() => void pickFolder()}
            style={{ padding: "8px 12px", fontSize: 12, color: "var(--accent)", cursor: "pointer", transition: "background 0.1s" }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--accent-bg)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
          >
            Open Different Project...
          </div>
        </div>
      )}
    </div>
  );
}
