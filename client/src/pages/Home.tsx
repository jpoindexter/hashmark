import { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "../lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface Mission {
  id: string;
  title: string;
  message_count: number;
  updated_at: number; // unix seconds
}

interface ProjectInfo {
  projectName: string;
  projectDir: string;
}

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  { id: "o3", label: "o3" },
  { id: "gpt-4o", label: "GPT-4o" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function elapsedStr(updatedSec: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - updatedSec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function timeAgo(sec: number): string {
  const d = Math.floor(Date.now() / 1000) - sec;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function uuidShort(id: string): string {
  return id.slice(0, 8).toLowerCase();
}

// ── Pulsing dot ──────────────────────────────────────────────────────────────

function PulsingDot() {
  return (
    <div style={{
      width: 7, height: 7, borderRadius: "50%",
      background: "var(--accent)", flexShrink: 0,
      animation: "pdot 1.9s ease-in-out infinite",
    }} />
  );
}

// ── Mission card ─────────────────────────────────────────────────────────────

function MissionCard({ mission, running, onView, onStop }: {
  mission: Mission;
  running: boolean;
  onView: () => void;
  onStop: () => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${running ? "rgba(0,208,132,0.15)" : "var(--border)"}`,
      borderRadius: "var(--radius)",
      padding: "16px",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
        {running
          ? <PulsingDot />
          : <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--text-dimmer)", flexShrink: 0 }} />
        }
        <span style={{
          fontFamily: "var(--font)", fontSize: 10, letterSpacing: "0.04em",
          color: running ? "var(--accent)" : "var(--text-dimmer)",
        }}>
          {running ? "running" : "done"}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)" }}>
          {running ? elapsedStr(mission.updated_at) : timeAgo(mission.updated_at)}
        </span>
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "var(--font)", fontSize: 12, color: "var(--text)",
        marginBottom: 3, lineHeight: 1.5,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {mission.title || "untitled mission"}
      </div>

      {/* UUID */}
      <div style={{
        fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)",
        marginBottom: 14, letterSpacing: "0.04em",
      }}>
        {uuidShort(mission.id)}
      </div>

      {/* Meta */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)" }}>messages</span>
          <span style={{ fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dim)" }}>{mission.message_count}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={onView}
          style={{
            flex: 1, fontFamily: "var(--font)", fontSize: 10, padding: "6px 0",
            background: running ? "var(--accent)" : "transparent",
            border: `1px solid ${running ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--radius)",
            color: running ? "#000" : "var(--text-dim)",
            cursor: "pointer", letterSpacing: "0.04em",
          }}
        >
          {running ? "view" : "review"}
        </button>
        {running ? (
          <button
            onClick={onStop}
            style={{
              fontFamily: "var(--font)", fontSize: 10, padding: "6px 14px",
              background: "transparent", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "var(--radius)", color: "var(--red)",
              cursor: "pointer", letterSpacing: "0.04em",
            }}
          >
            stop
          </button>
        ) : (
          <button
            onClick={onView}
            style={{
              fontFamily: "var(--font)", fontSize: 10, padding: "6px 14px",
              background: "transparent", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", color: "var(--text-dimmer)",
              cursor: "pointer", letterSpacing: "0.04em",
            }}
          >
            audit
          </button>
        )}
      </div>
    </div>
  );
}

// ── Dispatch modal ───────────────────────────────────────────────────────────

function DispatchModal({ onClose, onDispatched }: {
  onClose: () => void;
  onDispatched: (sessionId: string, prompt: string, model: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleDispatch = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetchApi("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || undefined }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `server error ${r.status}`);
        setLoading(false);
        return;
      }
      const d = await r.json() as { session: { id: string } };
      onDispatched(d.session.id, prompt.trim(), model);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create session");
      setLoading(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", fontFamily: "var(--font)", fontSize: 12,
    background: "var(--bg)", border: "1px solid var(--border)",
    color: "var(--text)", borderRadius: "var(--radius)",
    padding: "8px 12px", outline: "none", boxSizing: "border-box",
  };

  const label: React.CSSProperties = {
    fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)",
    marginBottom: 6, letterSpacing: "0.04em", display: "block",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 540,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "24px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font)", fontSize: 12, color: "var(--text)", letterSpacing: "0.04em" }}>
            new mission briefing
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-dimmer)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Title */}
        <div>
          <span style={label}>mission title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="auto-generated from prompt"
            style={field}
          />
        </div>

        {/* Model */}
        <div>
          <span style={label}>model</span>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ ...field, cursor: "pointer" }}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        {/* Prompt */}
        <div>
          <span style={label}>objective</span>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void handleDispatch(); } }}
            placeholder="describe what you want the agent to do..."
            rows={5}
            style={{ ...field, resize: "none", lineHeight: 1.6 }}
          />
        </div>

        {/* Briefing toggle (Phase 2 placeholder) */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 12px",
          background: "var(--bg)", border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
        }}>
          <span style={{ fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.04em" }}>
            attach codebase context
          </span>
          <div style={{
            width: 28, height: 16, borderRadius: 8, background: "var(--accent)",
            position: "relative", cursor: "pointer", flexShrink: 0,
          }}>
            <div style={{
              width: 12, height: 12, borderRadius: 6, background: "#000",
              position: "absolute", top: 2, right: 2,
            }} />
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div style={{
            fontFamily: "var(--font)", fontSize: 11, color: "var(--red)",
            background: "var(--red-bg)", border: "1px solid var(--red)",
            borderRadius: "var(--radius)", padding: "7px 12px",
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              fontFamily: "var(--font)", fontSize: 11, padding: "8px 16px",
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-dim)", borderRadius: "var(--radius)", cursor: "pointer",
            }}
          >
            cancel
          </button>
          <button
            onClick={() => void handleDispatch()}
            disabled={!prompt.trim() || loading}
            style={{
              fontFamily: "var(--font)", fontSize: 11, padding: "8px 22px", fontWeight: 600,
              background: prompt.trim() && !loading ? "var(--accent)" : "var(--surface-2)",
              border: "none",
              color: prompt.trim() && !loading ? "#000" : "var(--text-dimmer)",
              borderRadius: "var(--radius)",
              cursor: prompt.trim() && !loading ? "pointer" : "default",
            }}
          >
            {loading ? "dispatching..." : "dispatch mission"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project header ───────────────────────────────────────────────────────────

function ProjectHeader({ info }: { info: ProjectInfo | null }) {
  const [hovering, setHovering] = useState(false);

  const openProject = () => {
    const s = window.studio;
    if (!s?.pickFolder) return;
    void s.pickFolder().then((dir) => {
      if (!dir) return; // user cancelled
      // Register workspace on server so ctx.projectDir updates before the reload
      void fetchApi("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dir }),
      })
        .then((r) => r.json() as Promise<{ workspace?: { id: string } }>)
        .then(({ workspace }) => {
          if (workspace?.id) {
            return fetchApi(`/api/workspaces/${workspace.id}/activate`, { method: "POST" });
          }
        })
        .catch(() => {})
        .finally(() => {
          // Rust persists the dir and emits studio:reload — server is already updated
          void s.setProjectDir(dir);
        });
    });
  };

  // Shorten path: show last 2 segments
  const shortPath = (dir: string) => {
    const parts = dir.replace(/\/$/, "").split("/");
    if (parts.length <= 2) return dir;
    return ".../" + parts.slice(-2).join("/");
  };

  const hasTauri = !!(window.studio?.pickFolder);

  if (!info?.projectDir) {
    return (
      <div style={{
        padding: "10px 28px",
        borderBottom: "0.5px solid var(--border-dim)",
        display: "flex", alignItems: "center", gap: 10,
        background: "var(--bg)",
      }}>
        <span style={{ fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.04em" }}>
          no project open
        </span>
        {hasTauri && (
          <button
            onClick={() => void openProject()}
            style={{
              fontFamily: "var(--font)", fontSize: 10, padding: "4px 10px",
              background: "var(--accent)", border: "none", borderRadius: "var(--radius)",
              color: "#000", cursor: "pointer", letterSpacing: "0.04em",
            }}
          >
            open project
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      padding: "10px 28px",
      borderBottom: "0.5px solid var(--border-dim)",
      display: "flex", alignItems: "center", gap: 10,
      background: "var(--bg)",
    }}>
      <span style={{ fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.04em", userSelect: "none" }}>
        ▸
      </span>
      <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.02em" }}>
        {shortPath(info.projectDir)}
      </span>
      {hasTauri && (
        <button
          onClick={() => void openProject()}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          style={{
            fontFamily: "var(--font)", fontSize: 10, padding: "3px 8px",
            background: "transparent",
            border: `1px solid ${hovering ? "var(--border)" : "transparent"}`,
            borderRadius: "var(--radius)",
            color: hovering ? "var(--text-dim)" : "var(--text-dimmer)",
            cursor: "pointer", letterSpacing: "0.04em",
            transition: "color 0.1s, border-color 0.1s",
          }}
        >
          change
        </button>
      )}
    </div>
  );
}

// ── Mission Board ────────────────────────────────────────────────────────────

export default function Home() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showDispatch, setShowDispatch] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);

  useEffect(() => {
    fetchApi("/api/info")
      .then((r) => r.json())
      .then((d: ProjectInfo) => setProjectInfo(d))
      .catch(() => {});
  }, []);

  const fetchMissions = useCallback(() => {
    fetchApi("/api/sessions")
      .then((r) => r.json())
      .then((d: { sessions?: Mission[] }) => {
        setMissions((d.sessions ?? []).filter((s) => s.message_count > 0));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchMissions();
    const id = setInterval(fetchMissions, 8000);
    return () => clearInterval(id);
  }, [fetchMissions]);

  // Sync running state from Shell
  useEffect(() => {
    const handler = (e: Event) => {
      const { streaming, sessionId } = (e as CustomEvent<{ streaming: boolean; sessionId: string | null }>).detail;
      setRunningId(streaming ? sessionId : null);
      if (!streaming) fetchMissions();
    };
    window.addEventListener("studio:streaming-change", handler);
    return () => window.removeEventListener("studio:streaming-change", handler);
  }, [fetchMissions]);

  const openMission = (sessionId: string) => {
    window.dispatchEvent(new CustomEvent("studio:open-mission", { detail: { sessionId } }));
  };

  const stopMission = (sessionId: string) => {
    fetchApi(`/api/sessions/${sessionId}/interrupt`, { method: "POST" }).catch(() => {});
    setRunningId(null);
  };

  const handleDispatched = (sessionId: string, prompt: string, model: string) => {
    setShowDispatch(false);
    try {
      sessionStorage.setItem(`studio:prefill:${sessionId}`, JSON.stringify({ prompt, model }));
    } catch { /* noop */ }
    openMission(sessionId);
  };

  const running = missions.filter((m) => m.id === runningId);
  const done = missions.filter((m) => m.id !== runningId);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
      <style>{`@keyframes pdot { 0%,100%{opacity:1} 50%{opacity:.15} }`}</style>

      <ProjectHeader info={projectInfo} />

      <div style={{ flex: 1, overflowY: "auto", padding: "28px" }}>

        {/* Empty state */}
        {missions.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            minHeight: "60vh",
          }}>
            <div style={{
              fontFamily: "var(--font)", fontSize: 12, color: "var(--text-dimmer)",
              marginBottom: 20, letterSpacing: "0.04em",
            }}>
              no active missions
            </div>
            <button
              onClick={() => setShowDispatch(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font)", fontSize: 11, padding: "8px 18px", fontWeight: 600,
                background: "var(--accent)", border: "none",
                color: "#000", borderRadius: "var(--radius)", cursor: "pointer",
              }}
            >
              + new mission
            </button>
          </div>
        )}

        {/* Running */}
        {running.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{
              fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)",
              letterSpacing: "0.06em", marginBottom: 12,
            }}>
              active
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {running.map((m) => (
                <MissionCard
                  key={m.id} mission={m} running
                  onView={() => openMission(m.id)}
                  onStop={() => stopMission(m.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Done */}
        {done.length > 0 && (
          <div>
            <div style={{
              fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)",
              letterSpacing: "0.06em", marginBottom: 12,
            }}>
              completed
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {done.map((m) => (
                <MissionCard
                  key={m.id} mission={m} running={false}
                  onView={() => openMission(m.id)}
                  onStop={() => {}}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {missions.length > 0 && (
        <div style={{
          padding: "12px 28px",
          borderTop: "0.5px solid var(--border-dim)",
          display: "flex", justifyContent: "flex-end",
        }}>
          <button
            onClick={() => setShowDispatch(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "var(--font)", fontSize: 11, padding: "7px 16px", fontWeight: 600,
              background: "var(--accent)", border: "none",
              color: "#000", borderRadius: "var(--radius)", cursor: "pointer",
            }}
          >
            + new mission
          </button>
        </div>
      )}

      {showDispatch && (
        <DispatchModal onClose={() => setShowDispatch(false)} onDispatched={handleDispatched} />
      )}
    </div>
  );
}
