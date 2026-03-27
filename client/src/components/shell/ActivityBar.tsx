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

const topItems: NavItem[] = [
  { path: "/", icon: MessageSquare, label: "Chat" },
  { path: "/agents", icon: Bot, label: "Agents" },
  { path: "/files", icon: FolderTree, label: "Files" },
];

const bottomItems: NavItem[] = [
  { path: "/settings", icon: Settings, label: "Settings" },
];

const SIDEBAR_WIDTH = 160;

const containerStyle: CSSProperties = {
  width: SIDEBAR_WIDTH,
  background: "var(--bg-2)",
  borderRight: "1px solid var(--border-dim)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  flexShrink: 0,
};

// Wordmark at top of sidebar
const brandStyle: CSSProperties = {
  height: 48,
  display: "flex",
  alignItems: "center",
  paddingLeft: 16,
  paddingRight: 12,
  borderBottom: "1px solid var(--border-dim)",
  gap: 8,
  userSelect: "none",
};

const hashmarkLogoStyle: CSSProperties = {
  width: 18,
  height: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const wordmarkStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  color: "var(--text)",
  fontFamily: "var(--font-ui)",
};

function isPathActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === "/") return currentPath === "/" || currentPath === "/sessions";
  return currentPath.startsWith(itemPath);
}

function NavItemButton({
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
    width: "100%",
    height: 36,
    display: "flex",
    alignItems: "center",
    gap: 9,
    paddingLeft: 14,
    paddingRight: 12,
    background: active ? "var(--bg-3)" : "none",
    border: "none",
    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
    color: active ? "var(--text)" : "var(--text-dim)",
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "var(--font-ui)",
    fontWeight: active ? 500 : 400,
    textAlign: "left",
    transition: "color 0.1s, background 0.1s",
  };

  return (
    <button
      className="activity-item"
      onClick={onClick}
      style={style}
      aria-label={item.label}
    >
      <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
      <span style={{ fontSize: 13, lineHeight: 1 }}>{item.label}</span>
    </button>
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
      {/* Brand */}
      <div style={brandStyle}>
        <div style={hashmarkLogoStyle}>
          <svg viewBox="0 0 18 18" width="18" height="18" fill="none">
            <rect x="5.5" y="2" width="2" height="14" rx="1" fill="var(--accent)"/>
            <rect x="10.5" y="2" width="2" height="14" rx="1" fill="var(--accent)"/>
            <rect x="3" y="6" width="12" height="2" rx="1" fill="var(--accent)"/>
            <rect x="3" y="10" width="12" height="2" rx="1" fill="var(--accent)"/>
          </svg>
        </div>
        <span style={wordmarkStyle}>hashmark</span>
      </div>

      {/* Top nav */}
      <div style={{ display: "flex", flexDirection: "column", paddingTop: 6 }}>
        {topItems.map((item) => (
          <NavItemButton
            key={item.path}
            item={item}
            active={isPathActive(item.path, location.pathname)}
            onClick={() => handleClick(item.path)}
          />
        ))}
      </div>

      {/* Bottom nav */}
      <div style={{ display: "flex", flexDirection: "column", paddingBottom: 4 }}>
        {bottomItems.map((item) => (
          <NavItemButton
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
