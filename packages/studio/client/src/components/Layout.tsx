import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import ChatPanel from "./ChatPanel.tsx";

const TerminalPane = lazy(() => import("./Terminal.tsx"));

interface ProjectInfo {
  projectName: string;
  projectDir: string;
}

const NAV = [
  { to: "/", label: "HOME", icon: "⌂", title: "Home" },
  { to: "/files", label: "FILES", icon: "◫", title: "Files" },
  { to: "/git", label: "GIT", icon: "⎇", title: "Git" },
  { to: "/sessions", label: "CHAT", icon: "◈", title: "Sessions" },
  { to: "/agents", label: "AGENTS", icon: "▣", title: "Agents" },
  { to: "/generate", label: "GEN", icon: "⟳", title: "Generate" },
  { to: "/settings", label: "SET", icon: "⚙", title: "Settings" },
];

export default function Layout() {
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [termOpen, setTermOpen] = useState(false);
  const [termHeight, setTermHeight] = useState(220);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(320);
  const draggingTerm = useRef(false);
  const draggingChat = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  useEffect(() => {
    fetch("/api/info").then((r) => r.json()).then(setInfo).catch(() => {});
  }, []);

  // Terminal drag resize
  const onTermDragStart = (e: React.MouseEvent) => {
    draggingTerm.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = termHeight;
    e.preventDefault();
  };

  // Chat panel drag resize
  const onChatDragStart = (e: React.MouseEvent) => {
    draggingChat.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = chatWidth;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingTerm.current) {
        const delta = dragStartY.current - e.clientY;
        setTermHeight(Math.max(80, Math.min(600, dragStartH.current + delta)));
      }
      if (draggingChat.current) {
        const delta = dragStartX.current - e.clientX;
        setChatWidth(Math.max(240, Math.min(600, dragStartW.current + delta)));
      }
    };
    const onUp = () => {
      draggingTerm.current = false;
      draggingChat.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
      background: "var(--bg)",
      WebkitAppRegion: "no-drag",
    } as React.CSSProperties}>

      {/* Activity bar — leftmost narrow strip */}
      <aside style={{
        width: "44px",
        minWidth: "44px",
        background: "var(--bg-2)",
        borderRight: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "40px", // space for macOS traffic lights
        overflow: "visible",
        zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{
          fontSize: "14px",
          fontWeight: 900,
          color: "var(--accent)",
          marginBottom: "16px",
          letterSpacing: "-0.02em",
        }}>
          #
        </div>

        {/* Nav icons */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "2px", width: "100%" }}>
          {NAV.map((item) => (
            <div key={item.to} className="nav-tooltip-wrap">
              <NavLink
                to={item.to}
                end={item.to === "/"}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "40px",
                  fontSize: "15px",
                  color: isActive ? "var(--text)" : "var(--text-dimmer)",
                  background: isActive ? "var(--accent-bg)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "all 0.1s",
                  textDecoration: "none",
                })}
              >
                {item.icon}
              </NavLink>
              <span className="nav-tooltip">{item.title}</span>
            </div>
          ))}
        </nav>

        {/* Bottom: terminal toggle */}
        <div style={{ flex: 1 }} />
        <div className="nav-tooltip-wrap">
          <button
            onClick={() => setTermOpen((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: termOpen ? "var(--accent)" : "var(--text-dimmer)",
              fontSize: "14px",
              cursor: "pointer",
              height: "40px",
              width: "44px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "4px",
            }}
          >
            ⌨
          </button>
          <span className="nav-tooltip">Terminal</span>
        </div>
        <button
          onClick={() => setChatOpen((v) => !v)}
          title="Toggle Chat Panel"
          style={{
            background: "none",
            border: "none",
            color: chatOpen ? "var(--accent)" : "var(--text-dimmer)",
            fontSize: "13px",
            cursor: "pointer",
            height: "40px",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "8px",
          }}
        >
          ◈
        </button>
      </aside>

      {/* Center + right layout */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Main workspace */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}>
          {/* Title bar area */}
          <div style={{
            height: "38px",
            minHeight: "38px",
            background: "var(--bg-2)",
            borderBottom: "1px solid var(--border-dim)",
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            WebkitAppRegion: "drag",
            gap: "8px",
          } as React.CSSProperties}>
            <span style={{
              fontSize: "11px",
              color: "var(--text-dimmer)",
              marginLeft: "60px", // macOS traffic lights
              fontFamily: "var(--font)",
            }}>
              {info?.projectName ?? "loading..."}
            </span>
            {info && (
              <span style={{ fontSize: "10px", color: "var(--text-dimmer)", opacity: 0.5 }}>
                {info.projectDir.replace(/^\/Users\/[^/]+/, "~")}
              </span>
            )}
          </div>

          {/* Content + terminal */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Main content */}
            <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              <Outlet />
            </div>

            {/* Terminal panel */}
            {termOpen && (
              <>
                {/* Drag handle */}
                <div
                  onMouseDown={onTermDragStart}
                  style={{
                    height: "4px",
                    background: "var(--border-dim)",
                    cursor: "ns-resize",
                    flexShrink: 0,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--border-dim)")}
                />
                <div style={{
                  height: `${termHeight}px`,
                  minHeight: "80px",
                  background: "var(--bg)",
                  borderTop: "1px solid var(--border-dim)",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                }}>
                  {/* Terminal header */}
                  <div style={{
                    height: "28px",
                    background: "var(--bg-2)",
                    borderBottom: "1px solid var(--border-dim)",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 12px",
                    gap: "8px",
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      TERMINAL
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--text-dimmer)", opacity: 0.5 }}>
                      {info?.projectDir.replace(/^\/Users\/[^/]+/, "~")}
                    </span>
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={() => setTermOpen(false)}
                      style={{ background: "none", border: "none", color: "var(--text-dimmer)", cursor: "pointer", fontSize: "14px", lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <Suspense fallback={null}>
                      <TerminalPane />
                    </Suspense>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chat panel — right side, always present */}
        {chatOpen && (
          <>
            {/* Chat drag handle */}
            <div
              onMouseDown={onChatDragStart}
              style={{
                width: "4px",
                background: "var(--border-dim)",
                cursor: "ew-resize",
                flexShrink: 0,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--border-dim)")}
            />
            <div style={{
              width: `${chatWidth}px`,
              minWidth: "240px",
              maxWidth: "600px",
              background: "var(--bg-2)",
              borderLeft: "1px solid var(--border-dim)",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              overflow: "hidden",
            }}>
              <ChatPanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
