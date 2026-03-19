import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from "react";
import {
  FolderTree, GitCompare, ShieldCheck,
  ChevronRight, ChevronDown, Folder, FileCode, FileText,
  CheckCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
  ext?: string;
}

interface GitFile {
  status: string;
  file?: string;
}

interface GitData {
  branch: string;
  files: GitFile[];
}

type RightTab = "files" | "changes" | "checks";

interface RightSidebarProps {
  width: number;
  git: GitData | null;
  changedFiles: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const CODE_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "py", "go", "rs", "rb", "java",
  "c", "cpp", "h", "cs", "swift", "kt", "sh", "bash", "sql",
]);

const STATUS_COLOR: Record<string, string> = {
  M: "var(--yellow)",
  A: "var(--accent)",
  D: "var(--red)",
  "?": "var(--blue)",
  R: "#8b5cf6",
  C: "var(--cyan)",
  U: "#f97316",
};

const TABS: Array<{ id: RightTab; label: string; icon: React.ElementType }> = [
  { id: "files", label: "All files", icon: FolderTree },
  { id: "changes", label: "Changes", icon: GitCompare },
  { id: "checks", label: "Checks", icon: ShieldCheck },
];

/* ------------------------------------------------------------------ */
/*  Compact file tree (read-only, no git badges, no context menu)     */
/* ------------------------------------------------------------------ */

function fileIcon(ext?: string) {
  if (ext && CODE_EXTS.has(ext)) return FileCode;
  return FileText;
}

function CompactTreeRow({
  node,
  depth,
}: {
  node: FileNode;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 1);
  const [hovered, setHovered] = useState(false);
  const isDir = node.type === "dir";
  const Icon = isDir ? Folder : fileIcon(node.ext);
  const Chevron = open ? ChevronDown : ChevronRight;

  const sorted = useMemo(() => {
    if (!node.children) return [];
    return [...node.children].sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [node.children]);

  const handleClick = () => {
    if (isDir) {
      setOpen((v) => !v);
    } else {
      window.dispatchEvent(
        new CustomEvent("studio:open-file", { detail: { path: node.path } }),
      );
    }
  };

  return (
    <>
      <div
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          height: 20,
          paddingLeft: 6 + depth * 14,
          paddingRight: 6,
          cursor: "pointer",
          userSelect: "none",
          fontSize: 11,
          fontFamily: "var(--font)",
          color: "var(--text-dim)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          background: hovered ? "var(--hover-bg)" : "transparent",
        }}
      >
        {isDir && (
          <Chevron
            size={10}
            style={{ flexShrink: 0, color: "var(--text-dimmer)" }}
          />
        )}
        {!isDir && <span style={{ width: 10, flexShrink: 0 }} />}
        <Icon
          size={12}
          style={{
            flexShrink: 0,
            color: isDir ? "var(--text-dim)" : "var(--text-dimmer)",
          }}
        />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.name}
        </span>
      </div>
      {isDir &&
        open &&
        sorted.map((child) => (
          <CompactTreeRow key={child.path} node={child} depth={depth + 1} />
        ))}
    </>
  );
}

function FilesTab() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/files/tree")
      .then((r) => r.json())
      .then((d: { tree?: FileNode[] }) => setTree(d.tree ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(
    () =>
      [...tree].sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [tree],
  );

  if (loading) {
    return (
      <div style={{ padding: "12px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        {[60, 50, 45, 55, 40].map((w, i) => (
          <div
            key={i}
            style={{
              height: 10,
              width: `${w}%`,
              marginLeft: i > 0 ? 14 : 0,
              background: "var(--bg-3)",
              borderRadius: 3,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        ))}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div style={{ padding: "12px 10px", fontSize: 11, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
        No files found.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
      {sorted.map((node) => (
        <CompactTreeRow key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Changes tab                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const char = status[0] ?? "?";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
        fontSize: 9,
        fontWeight: 700,
        color: STATUS_COLOR[char] ?? "var(--text-dimmer)",
        background: "var(--bg-3)",
        borderRadius: "var(--radius-sm)",
        flexShrink: 0,
        fontFamily: "var(--font)",
      }}
    >
      {char}
    </span>
  );
}

function ChangesTab({ git }: { git: GitData | null }) {
  const files = git?.files ?? [];

  if (files.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "32px 16px",
          color: "var(--text-dimmer)",
          fontSize: 11,
          fontFamily: "var(--font)",
          textAlign: "center",
        }}
      >
        <CheckCircle size={20} style={{ opacity: 0.4 }} />
        <span>Working tree clean</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
      <div
        style={{
          padding: "6px 10px",
          fontSize: 10,
          fontFamily: "var(--font)",
          color: "var(--text-dimmer)",
          letterSpacing: "0.06em",
          userSelect: "none",
        }}
      >
        {files.length} CHANGED FILE{files.length !== 1 ? "S" : ""}
      </div>
      {files.map((f) => {
        const filePath = f.file ?? "";
        const name = filePath.split("/").pop() ?? filePath;
        const dir = filePath.includes("/")
          ? filePath.split("/").slice(0, -1).join("/")
          : "";

        return (
          <ChangeRow key={filePath || f.status} file={filePath} name={name} dir={dir} status={f.status} />
        );
      })}
    </div>
  );
}

function ChangeRow({
  file,
  name,
  dir,
  status,
}: {
  file: string;
  name: string;
  dir: string;
  status: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("studio:open-file", { detail: { path: file } }),
        )
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        paddingLeft: 10,
        paddingRight: 8,
        cursor: "pointer",
        userSelect: "none",
        fontSize: 11,
        fontFamily: "var(--font)",
        color: "var(--text-dim)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        background: hovered ? "var(--hover-bg)" : "transparent",
      }}
    >
      <StatusBadge status={status} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {name}
      </span>
      {dir && (
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: "var(--text-dimmer)",
            flexShrink: 0,
            maxWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {dir}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Checks tab                                                        */
/* ------------------------------------------------------------------ */

function ChecksTab() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "32px 16px",
        color: "var(--text-dimmer)",
        fontSize: 11,
        fontFamily: "var(--font)",
        textAlign: "center",
      }}
    >
      <CheckCircle size={20} style={{ color: "var(--accent)", opacity: 0.5 }} />
      <span>No issues found</span>
      <span style={{ fontSize: 10, opacity: 0.6 }}>Lint and type errors will appear here</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Resize handle (left edge)                                         */
/* ------------------------------------------------------------------ */

function RightSidebarResize({
  onResize,
  onReset,
  currentWidth,
}: {
  onResize: (w: number) => void;
  onReset: () => void;
  currentWidth: number;
}) {
  const sashRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const MIN = 200;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = currentWidth;
      const sash = sashRef.current;
      if (sash) sash.classList.add("active");

      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:9999;cursor:col-resize";
      document.body.appendChild(overlay);
      overlayRef.current = overlay;

      const maxW = Math.floor(window.innerWidth * 0.45);

      function onMouseMove(ev: MouseEvent) {
        const delta = startX - ev.clientX;
        const next = Math.max(MIN, Math.min(startWidth + delta, maxW));
        onResize(next);
        if (sash) {
          sash.classList.toggle("at-min", next <= MIN);
          sash.classList.toggle("at-max", next >= maxW);
        }
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (sash) sash.classList.remove("active", "at-min", "at-max");
        if (overlayRef.current) {
          document.body.removeChild(overlayRef.current);
          overlayRef.current = null;
        }
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [currentWidth, onResize],
  );

  return (
    <div
      ref={sashRef}
      className="sash"
      onMouseDown={handleMouseDown}
      onDoubleClick={onReset}
      style={{ width: 4, flexShrink: 0, alignSelf: "stretch" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

const DEFAULT_WIDTH = 280;

export default function RightSidebar({ width, git, changedFiles }: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<RightTab>("files");

  const tabBarStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    height: 35,
    minHeight: 35,
    borderBottom: "1px solid var(--border-dim)",
    flexShrink: 0,
    gap: 0,
  };

  return (
    <div
      style={{
        width,
        minWidth: 0,
        overflow: "hidden",
        background: "var(--bg-2)",
        borderLeft: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Inner wrapper to prevent text reflow during animation */}
      <div
        style={{
          minWidth: width,
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Tab bar */}
        <div style={tabBarStyle}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            const showBadge = tab.id === "changes" && changedFiles > 0;

            return (
              <TabButton
                key={tab.id}
                active={active}
                onClick={() => setActiveTab(tab.id)}
                label={tab.label}
                icon={<Icon size={12} />}
                badge={showBadge ? changedFiles : undefined}
              />
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {activeTab === "files" && <FilesTab />}
          {activeTab === "changes" && <ChangesTab git={git} />}
          {activeTab === "checks" && <ChecksTab />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab button                                                        */
/* ------------------------------------------------------------------ */

function TabButton({
  active,
  onClick,
  label,
  icon,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 10px",
        height: "100%",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        background: hovered ? "var(--hover-bg)" : "transparent",
        color: active ? "var(--text)" : "var(--text-dimmer)",
        fontSize: 11,
        fontFamily: "var(--font-ui)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "color 0.1s ease, border-color 0.1s ease",
      }}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            background: "var(--accent-bg)",
            color: "var(--accent)",
            borderRadius: 8,
            padding: "0 5px",
            lineHeight: "16px",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Export resize handle + default width for Shell to use              */
/* ------------------------------------------------------------------ */

export { RightSidebarResize, DEFAULT_WIDTH as RIGHT_SIDEBAR_DEFAULT_WIDTH };
