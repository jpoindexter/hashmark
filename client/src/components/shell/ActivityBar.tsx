import { type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  FolderTree,
  Bot,
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

// Four primary nav items — everything else lives in command palette or chat commands
const topItems: NavItem[] = [
  { path: "/", icon: MessageSquare, label: "Chat" },
  { path: "/agents", icon: Bot, label: "Agents", shortcut: "\u2318\u21E7A" },
  { path: "/files", icon: FolderTree, label: "Files", shortcut: "\u2318\u21E7E" },
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
        aria-label={item.label}
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

    if (path === "/settings") {
      if (clickingSameView) {
        navigate("/");
      } else {
        navigate(path);
      }
      return;
    }

    if (clickingSameView && sidebarOpen) {
      onToggleSidebar();
    } else {
      navigate(path);
      if (!sidebarOpen) {
        onToggleSidebar();
      }
    }
  };

  return (
    <div style={containerStyle}>
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
