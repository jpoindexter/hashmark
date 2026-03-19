import { type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  FolderTree,
  GitCompare,
  Bot,
  PlayCircle,
  Zap,
  Shield,
  Settings,
} from "lucide-react";

interface ActivityBarProps {
  activeView: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

interface NavItem {
  path: string;
  icon: React.ElementType;
  label: string;
  shortcut?: string;
}

const topItems: NavItem[] = [
  { path: "/", icon: MessageSquare, label: "Chat" },
  { path: "/files", icon: FolderTree, label: "Explorer", shortcut: "\u2318\u21E7E" },
  { path: "/source-control", icon: GitCompare, label: "Source Control", shortcut: "\u2318\u21E7G" },
  { path: "/agents", icon: Bot, label: "Agents", shortcut: "\u2318\u21E7A" },
  { path: "/run", icon: PlayCircle, label: "Run" },
  { path: "/generate", icon: Zap, label: "Generate" },
  { path: "/governance", icon: Shield, label: "Governance" },
];

const bottomItems: NavItem[] = [
  { path: "/settings", icon: Settings, label: "Settings", shortcut: "\u2318," },
];

const containerStyle: CSSProperties = {
  width: 48,
  background: "var(--bg-2)",
  borderRight: "1px solid var(--border-dim)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  flexShrink: 0,
};

function isPathActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === "/") return currentPath === "/";
  return currentPath.startsWith(itemPath);
}

function ActivityItem({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const tooltipText = item.shortcut
    ? `${item.label} (${item.shortcut})`
    : item.label;

  const style: CSSProperties = {
    width: 48,
    height: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    borderLeft: active
      ? "2px solid var(--accent)"
      : "2px solid transparent",
    color: active ? "var(--text)" : "var(--text-dimmer)",
    cursor: "pointer",
    padding: 0,
  };

  return (
    <div className="nav-tooltip-wrap">
      <button
        className="activity-item"
        onClick={onClick}
        style={style}
      >
        <Icon size={20} />
      </button>
      <span className="nav-tooltip">{tooltipText}</span>
    </div>
  );
}

export default function ActivityBar({
  activeView,
  sidebarOpen,
  onToggleSidebar,
}: ActivityBarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = (path: string) => {
    const clickingSameView = isPathActive(path, location.pathname);

    if (clickingSameView && sidebarOpen) {
      // Toggle sidebar closed when clicking the already-active icon
      onToggleSidebar();
    } else {
      navigate(path);
      // Ensure sidebar is open when switching views
      if (!sidebarOpen) {
        onToggleSidebar();
      }
    }
  };

  return (
    <div style={containerStyle}>
      {/* Top navigation icons */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {topItems.map((item) => (
          <ActivityItem
            key={item.path}
            item={item}
            active={isPathActive(item.path, location.pathname)}
            onClick={() => handleClick(item.path)}
          />
        ))}
      </div>

      {/* Bottom utility icons */}
      <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
        {bottomItems.map((item) => (
          <ActivityItem
            key={item.path}
            item={item}
            active={isPathActive(item.path, location.pathname)}
            onClick={() => handleClick(item.path)}
          />
        ))}
      </div>
    </div>
  );
}
