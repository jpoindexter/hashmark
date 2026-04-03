import { FileText, FilePlus, FileX, FilePen } from "lucide-react";

interface GitFile {
  status: string;
  path?: string;
}

interface ChangesPanelProps {
  files: GitFile[];
  onFileClick?: (path: string) => void;
}

function statusIcon(status: string) {
  const s = status.trim();
  if (s.includes("A") || s.includes("?")) return <FilePlus size={13} style={{ color: "var(--green)" }} />;
  if (s.includes("D")) return <FileX size={13} style={{ color: "var(--red)" }} />;
  if (s.includes("M")) return <FilePen size={13} style={{ color: "var(--yellow)" }} />;
  return <FileText size={13} style={{ color: "var(--text-dimmer)" }} />;
}

function statusBadge(status: string): string {
  const s = status.trim();
  if (s.includes("A") || s.includes("?")) return "A";
  if (s.includes("D")) return "D";
  if (s.includes("M")) return "M";
  if (s.includes("R")) return "R";
  return s.charAt(0) || "?";
}

function fileName(path: string): string {
  return path.split("/").pop() || path;
}

function fileDir(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.length > 2 ? ".../" + parts.slice(-2).join("/") : parts.join("/");
}

export default function ChangesPanel({ files, onFileClick }: ChangesPanelProps) {
  return (
    <div style={{
      width: 240,
      borderLeft: "1px solid var(--border-dim)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
      background: "var(--bg)",
    }}>
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border-dim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span className="label">Changes</span>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>{files.length}</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {files.map((f, i) => {
          const path = f.path || "";
          return (
            <div
              key={i}
              className="hoverable"
              onClick={() => path && onFileClick?.(path)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 14px",
                fontSize: 12,
                cursor: path ? "pointer" : "default",
              }}
            >
              {statusIcon(f.status)}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <span className="truncate" style={{ color: "var(--text)" }}>
                  {fileName(path)}
                </span>
                {fileDir(path) && (
                  <span className="truncate" style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
                    {fileDir(path)}
                  </span>
                )}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: f.status.includes("A") || f.status.includes("?") ? "var(--green)" :
                       f.status.includes("D") ? "var(--red)" :
                       f.status.includes("M") ? "var(--yellow)" : "var(--text-dimmer)",
                flexShrink: 0,
              }}>
                {statusBadge(f.status)}
              </span>
            </div>
          );
        })}
        {files.length === 0 && (
          <div style={{ padding: "20px 14px", textAlign: "center", fontSize: 12, color: "var(--text-dimmer)" }}>
            No changes
          </div>
        )}
      </div>
    </div>
  );
}
