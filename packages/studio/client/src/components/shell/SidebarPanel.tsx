import type { ReactNode } from "react";

interface SidebarPanelProps {
  activeView: string;
  width: number;
  open: boolean;
  sessionsSidebar: ReactNode;
}

const VIEW_TITLES: Record<string, string> = {
  chat: "Sessions",
  files: "Explorer",
  "source-control": "Source Control",
  agents: "Agents",
  run: "Runs",
  generate: "Generate",
  governance: "Policies",
};

const VIEW_DESCRIPTIONS: Record<string, string> = {
  files: "File explorer",
  "source-control": "Source control",
  agents: "Agent management",
  run: "Run tasks",
  generate: "Scan & generate",
  governance: "Policies",
};

const VIEWS = [
  "chat",
  "files",
  "source-control",
  "agents",
  "run",
  "generate",
  "governance",
] as const;

const placeholderStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: "var(--text-dimmer)",
};

function viewContent(
  view: string,
  activeView: string,
  sessionsSidebar: ReactNode,
): ReactNode {
  const visible = activeView === view;
  const base: React.CSSProperties = {
    display: visible ? "flex" : "none",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  };

  if (view === "chat") {
    return (
      <div key={view} style={base}>
        {sessionsSidebar}
      </div>
    );
  }

  return (
    <div key={view} style={base}>
      <div style={placeholderStyle}>{VIEW_DESCRIPTIONS[view] ?? "Opens in main content"}</div>
    </div>
  );
}

export default function SidebarPanel({
  activeView,
  width,
  open,
  sessionsSidebar,
}: SidebarPanelProps) {
  const resolvedWidth = open ? width : 0;
  const title = VIEW_TITLES[activeView] ?? "Sessions";

  return (
    <div
      style={{
        width: resolvedWidth,
        minWidth: 0,
        overflow: "hidden",
        transition: "width 0.18s ease",
        background: "var(--bg-2)",
        borderRight: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {/* Inner wrapper -- fades out before width shrinks, prevents text reflow */}
      <div style={{
        minWidth: width,
        opacity: open ? 1 : 0,
        transition: open ? "opacity 0.12s ease 0.06s" : "opacity 0.08s ease",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}>
        {/* 35px header */}
        <div
          style={{
            height: 35,
            minHeight: 35,
            display: "flex",
            alignItems: "center",
            paddingLeft: 12,
            paddingRight: 8,
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
            fontFamily: "var(--font-ui)",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {title}
        </div>

        {/* Content -- all views mounted, toggled via display */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {VIEWS.map((view) => viewContent(view, activeView, sessionsSidebar))}
        </div>
      </div>
    </div>
  );
}
