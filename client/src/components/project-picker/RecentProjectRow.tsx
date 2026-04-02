import { basename } from "../../lib/path.js";
import { timeAgo } from "../../lib/format";
import { FolderIcon } from "./ActionCard";
import type { RecentProject } from "./types";
import { truncatePath } from "./types";

export default function RecentProjectRow({
  proj,
  opening,
  onOpen,
}: {
  proj: RecentProject;
  opening: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      disabled={opening}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 36,
        padding: "0 12px",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: "var(--radius)",
        cursor: opening ? "default" : "pointer",
        textAlign: "left",
        width: "100%",
        opacity: opening ? 0.5 : 1,
        transition: "background 0.1s",
        boxSizing: "border-box",
      }}
      className="hoverable"
    >
      <FolderIcon size={14} color="var(--text-dimmer)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-dim)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {proj.name || basename(proj.dir)}
        </div>
        <div style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginTop: 1,
        }}>
          {truncatePath(proj.dir, 48)}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0 }}>
        {opening ? "opening..." : timeAgo(proj.lastOpened)}
      </div>
    </button>
  );
}
