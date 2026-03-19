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
  onViewChange: (path: string) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

interface NavItem {
  path: string;
  icon: React.ElementType;
  label: string;
}

const topItems: NavItem[] = [
  { path: "/", icon: MessageSquare, label: "Chat" },
  { path: "/files", icon: FolderTree, label: "Explorer" },
  { path: "/source-control", icon: GitCompare, label: "Source Control" },
  { path: "/agents", icon: Bot, label: "Agents" },
  { path: "/run", icon: PlayCircle, label: "Run" },
  { path: "/generate", icon: Zap, label: "Generate" },
  { path: "/governance", icon: Shield, label: "Governance" },
];

const bottomItems: NavItem[] = [
  { path: "/settings", icon: Settings, label: "Settings" },
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
    <button
      className="activity-item"
      title={item.label}
      onClick={onClick}
      style={style}
    >
      <Icon size={20} />
    </button>
  );
}

export default function ActivityBar({
  activeView,
  onViewChange,
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
      // Switch to the new view
      onViewChange(path);
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
