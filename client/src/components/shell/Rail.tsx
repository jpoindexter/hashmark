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
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.22 3.22l1.42 1.42M11.36 11.36l1.42 1.42M11.36 4.64l-1.42 1.42M4.64 11.36l-1.42 1.42" />
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

function IconUser() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 15, height: 15 }}>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3 14c0-2.761 2.239-5 5-5s5 2.239 5 5" strokeLinecap="round" />
    </svg>
  );
}

interface RailProps {
  agentsBadge?: boolean;
}

function isActive(path: string, current: string): boolean {
  if (path === "/") return current === "/" || current === "/sessions";
  return current.startsWith(path);
}

export default function Rail({ agentsBadge = false }: RailProps) {
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
    { path: "/", icon: <IconSessions />, badge: false },
    { path: "/agents", icon: <IconAgents />, badge: agentsBadge },
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

      <button
        className="rail-item"
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
