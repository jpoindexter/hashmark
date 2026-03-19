import { type ReactNode, lazy, Suspense } from "react";

const FileTreeSidebar = lazy(() => import("../sidebar/FileTreeSidebar.tsx"));
const GitSidebar = lazy(() => import("../sidebar/GitSidebar.tsx"));
const AgentsSidebar = lazy(() => import("../sidebar/AgentsSidebar.tsx"));

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
};

const VIEWS = [
  "chat",
  "files",
  "source-control",
  "agents",
] as const;

const fallbackStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 11,
  color: "var(--text-dimmer)",
  fontFamily: "var(--font)",
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

  if (view === "files") {
    return (
      <div key={view} style={base}>
        <Suspense fallback={<div style={fallbackStyle}>Loading...</div>}>
          <FileTreeSidebar />
        </Suspense>
      </div>
    );
  }

  if (view === "source-control") {
    return (
      <div key={view} style={base}>
        <Suspense fallback={<div style={fallbackStyle}>Loading...</div>}>
          <GitSidebar />
        </Suspense>
      </div>
    );
  }

  if (view === "agents") {
    return (
      <div key={view} style={base}>
        <Suspense fallback={<div style={fallbackStyle}>Loading...</div>}>
          <AgentsSidebar />
        </Suspense>
      </div>
    );
  }

  return (
    <div key={view} style={base}>
      <div style={fallbackStyle}>Opens in main content</div>
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
