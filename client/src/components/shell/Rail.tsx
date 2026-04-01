import { type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function IconSessions() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <path d="M2 4h12M2 8h8M2 12h10" strokeLinecap="round" />
    </svg>
  );
}

function IconAgents() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <rect x="3" y="5" width="10" height="8" rx="2" />
      <circle cx="6" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="9" r="1" fill="currentColor" stroke="none" />
      <path d="M8 2v3M5 2h6" strokeLinecap="round" />
    </svg>
  );
}

function IconFindings() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function IconGenerate() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <path d="M2 12L6 2l4 10M3.5 9h5M11 5h3M12.5 3.5v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRun() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <path d="M5 3l8 5-8 5V3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSwarm() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </svg>
  );
}

function IconCompany() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="3.5" cy="11" r="1.5" />
      <circle cx="12.5" cy="11" r="1.5" />
      <path d="M8 4.5V7M8 7L3.5 9.5M8 7l4.5 2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconGit() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="12" cy="8" r="1.5" />
      <path d="M4 5.5v5M4 7.5c0-2 2-3.5 6.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3 14c0-2.761 2.239-5 5-5s5 2.239 5 5" strokeLinecap="round" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.22 3.22l1.06 1.06M11.72 11.72l1.06 1.06M11.72 4.28l-1.06 1.06M4.28 11.72l-1.06 1.06" strokeLinecap="round" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
      <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSystem() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
      <rect x="2" y="3" width="12" height="9" rx="1.5" />
      <path d="M6 14h4M8 12v2" strokeLinecap="round" />
    </svg>
  );
}

interface RailProps {
  agentsBadge?: boolean;
  theme?: "dark" | "light";
  themeSetting?: "dark" | "light" | "system";
}

function isActive(path: string, current: string): boolean {
  if (path === "/") return current === "/" || current === "/sessions";
  return current.startsWith(path);
}

export default function Rail({ agentsBadge = false, theme = "dark", themeSetting = "dark" }: RailProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const rail: CSSProperties = {
    width: 52,
    background: "var(--bg)",
    borderRight: "0.5px solid var(--border-dim)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "14px 0 12px",
    flexShrink: 0,
    gap: 4,
  };

  const logo: CSSProperties = {
    fontFamily: "var(--font)",
    color: "var(--accent)",
    fontSize: 15,
    fontWeight: 500,
    marginBottom: 18,
    userSelect: "none",
    cursor: "default",
  };

  const items = [
    { path: "/", icon: <IconSessions />, badge: false, label: "Sessions" },
    { path: "/agents", icon: <IconAgents />, badge: agentsBadge, label: "Agents" },
    { path: "/generate", icon: <IconGenerate />, badge: false, label: "Generate" },
    { path: "/run", icon: <IconRun />, badge: false, label: "Run" },
    { path: "/swarm", icon: <IconSwarm />, badge: false, label: "Swarm" },
    { path: "/company", icon: <IconCompany />, badge: false, label: "Company" },
    { path: "/git", icon: <IconGit />, badge: false, label: "Git" },
    { path: "/history", icon: <IconHistory />, badge: false, label: "History" },
  ];

  return (
    <div style={rail}>
      <div style={logo}>#</div>

      {items.map((item) => {
        const active = isActive(item.path, location.pathname);
        return (
          <button
            key={item.path}
            className="rail-item"
            title={item.label}
            style={{
              width: 34, height: 34,
              borderRadius: 7,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              color: active ? "var(--text-dim)" : "var(--text-dimmer)",
              background: active ? "var(--bg-3)" : "transparent",
              border: "none",
              position: "relative",
              flexShrink: 0,
            }}
            onClick={() => navigate(item.path)}
          >
            {item.icon}
            {item.badge && (
              <span style={{
                position: "absolute", top: 4, right: 4,
                width: 7, height: 7, borderRadius: "50%",
                background: "var(--accent)",
                border: "1.5px solid var(--bg)",
              }} />
            )}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Theme toggle */}
      <button
        className="rail-item"
        title={themeSetting === "dark" ? "Switch to light" : themeSetting === "light" ? "Switch to system" : "Switch to dark"}
        style={{
          width: 34, height: 34,
          borderRadius: 7,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          color: "var(--text-dimmer)",
          background: "transparent",
          border: "none",
        }}
        onClick={() => window.dispatchEvent(new CustomEvent("studio:toggle-theme"))}
      >
        {themeSetting === "dark" ? <IconSun /> : themeSetting === "light" ? <IconSystem /> : <IconMoon />}
      </button>

      <button
        className="rail-item"
        title="Settings"
        style={{
          width: 34, height: 34,
          borderRadius: 7,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          color: isActive("/settings", location.pathname) ? "var(--text-dim)" : "var(--text-dimmer)",
          background: isActive("/settings", location.pathname) ? "var(--bg-3)" : "transparent",
          border: "none",
        }}
        onClick={() => navigate("/settings")}
      >
        <IconUser />
      </button>
    </div>
  );
}
