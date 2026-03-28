import { useState, useEffect, type CSSProperties } from "react";
import { fetchApi } from "../../lib/api";

interface Session {
  id: string;
  title: string;
  status: string;
  model?: string;
  updated_at: number;
}

interface ContextPanelProps {
  streaming: boolean;
  model?: string;
  branch?: string;
  projectName?: string;
}

const QUICK_CMDS = ["/scan", "/audit", "/fix all", "/review"];

function statusDot(status: string): { color: string; opacity: number; animate: boolean } {
  switch (status) {
    case "running":  return { color: "var(--accent)", opacity: 1, animate: true };
    case "pending":  return { color: "var(--yellow)", opacity: 1, animate: true };
    case "idle":     return { color: "var(--text-dimmer)", opacity: 0.5, animate: false };
    default:         return { color: "var(--text-dimmer)", opacity: 0.25, animate: false };
  }
}

export default function ContextPanel({ streaming, model = "sonnet 4.6", branch, projectName }: ContextPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchApi("/api/sessions")
        .then(r => r.ok ? r.json() as Promise<{ sessions: Session[] }> : Promise.reject())
        .then(d => { if (!cancelled) setSessions(d.sessions ?? []); })
        .catch(() => {});
    };

    load();
    const iv = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const running = sessions.filter(s => s.status === "running" || s.status === "pending");
  const recent = sessions.slice(0, 5);

  const panel: CSSProperties = {
    width: 184,
    borderLeft: "0.5px solid var(--border-dim)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflowY: "auto",
    background: "var(--bg)",
  };

  const sLbl: CSSProperties = {
    fontFamily: "var(--font)",
    fontSize: 10,
    color: "var(--text-dimmer)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "11px 14px 7px",
  };

  const sect: CSSProperties = {
    borderBottom: "0.5px solid var(--border-dim)",
    paddingBottom: 6,
  };

  const footer: CSSProperties = {
    marginTop: "auto",
    padding: "10px 14px",
    borderTop: "0.5px solid var(--border-dim)",
  };

  const footRow: CSSProperties = {
    fontFamily: "var(--font)",
    fontSize: 10,
    color: "var(--text-dimmer)",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 4,
  };

  const activeAgents = streaming ? (running.length > 0 ? running : sessions.slice(0, 4)) : [];

  return (
    <div style={panel}>
      {streaming && (
        <div style={sect}>
          <div style={sLbl}>agents{running.length > 0 ? ` · ${running.length}` : ""}</div>
          {activeAgents.length === 0 ? (
            <div style={{ padding: "6px 14px", fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)" }}>
              no active agents
            </div>
          ) : (
            activeAgents.map((s) => {
              const dot = statusDot(s.status);
              return (
                <div
                  key={s.id}
                  style={{ padding: "6px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  className="rail-item"
                >
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: dot.color,
                    opacity: dot.opacity,
                    flexShrink: 0,
                    animation: dot.animate ? "pdot 1.5s ease-in-out infinite" : "none",
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font)", fontSize: 11,
                      color: "var(--text-dim)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {s.title}
                    </div>
                    <div style={{ fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)", marginTop: 1 }}>
                      {s.status}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {!streaming && (
        <div style={sect}>
          <div style={sLbl}>recent</div>
          {recent.length === 0 ? (
            <div style={{ padding: "6px 14px", fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)" }}>
              no sessions yet
            </div>
          ) : (
            recent.map((s) => (
              <div
                key={s.id}
                style={{ padding: "6px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                className="rail-item"
              >
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--text-dimmer)", flexShrink: 0, opacity: 0.4 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "var(--font)", fontSize: 11, color: "var(--text-dim)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {s.title}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={sect}>
        <div style={sLbl}>quick start</div>
        {QUICK_CMDS.map((cmd) => (
          <div
            key={cmd}
            style={{ padding: "5px 14px", cursor: "pointer" }}
            className="rail-item"
          >
            <div style={{ fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)" }}>→ {cmd}</div>
          </div>
        ))}
      </div>

      <div style={footer}>
        <div style={footRow}><span>model</span><span>{model}</span></div>
        {projectName && (
          <div style={footRow}>
            <span>project</span>
            <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {projectName}
            </span>
          </div>
        )}
        {branch && (
          <div style={footRow}>
            <span>branch</span>
            <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {branch}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
