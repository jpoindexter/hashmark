import { useState, useEffect, useCallback } from "react";
import { GitBranch, FolderOpen, Plus, Bot, FileCode, ArrowRight } from "lucide-react";
import { fetchApi } from "../../lib/api";
import { useNavigate } from "react-router-dom";

interface ProjectInfo {
  projectName: string;
  projectDir: string;
}

interface GitStatus {
  branch: string;
  files: { status: string }[];
}

interface RecentSession {
  id: string;
  title: string;
  message_count: number;
  updated_at: number;
  status: string;
  last_message?: string | null;
}

const SUGGESTIONS = [
  "explain the architecture of this project",
  "review recent changes and summarize what changed",
  "find and fix bugs in the most recently modified files",
  "refactor the largest file into smaller modules",
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function shortenDir(dir: string): { dimmed: string; bold: string } {
  const home = dir.replace(/^\/Users\/[^/]+/, "~");
  const parts = home.split("/");
  const bold = parts.pop() ?? "";
  const dimmed = parts.join("/") + "/";
  return { dimmed, bold };
}

export function EmptyState({ modelLabel: _modelLabel, projectInfo, gitStatus, onNewSession }: {
  modelLabel: string;
  projectInfo?: ProjectInfo;
  gitStatus?: GitStatus;
  onNewSession?: () => void;
}) {
  const navigate = useNavigate();
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("studio_onboarded");
    if (!seen) setIsFirstLaunch(true);

    fetchApi("/api/sessions")
      .then(r => r.json())
      .then((data: { sessions: RecentSession[] }) => {
        setRecentSessions((data.sessions ?? []).slice(0, 5));
      })
      .catch(() => {});
  }, []);

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem("studio_onboarded", "1");
    setIsFirstLaunch(false);
  }, []);

  const openProject = useCallback(async () => {
    const studio = window.studio;
    if (studio?.pickFolder) {
      const dir = await studio.pickFolder();
      if (dir) await studio.setProjectDir?.(dir);
    }
  }, []);

  const changedCount = gitStatus?.files?.length ?? 0;
  const dir = projectInfo?.projectDir ? shortenDir(projectInfo.projectDir) : null;

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 0, padding: "0 40px", overflow: "auto",
    }}>
      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* First-launch welcome */}
        {isFirstLaunch && (
          <div style={{
            border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
            padding: "20px 24px", background: "var(--bg-2)", textAlign: "center",
          }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              Welcome to hashmark studio
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 16 }}>
              AI agent orchestration for your codebase. Start a session to chat with Claude about your project,
              or explore agents and context generation.
            </div>
            <button className="btn btn-primary" onClick={dismissOnboarding} style={{ fontSize: 13 }}>
              Get started
            </button>
          </div>
        )}

        {/* Project context card */}
        {projectInfo && !isFirstLaunch && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{
              fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em",
              color: "var(--text)", textAlign: "center",
            }}>
              {projectInfo.projectName}
            </div>

            {dir && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 12, color: "var(--text-dimmer)",
              }}>
                <FolderOpen size={13} style={{ flexShrink: 0 }} />
                <span>{dir.dimmed}<span style={{ color: "var(--text-dim)" }}>{dir.bold}</span></span>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
              {gitStatus?.branch && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-dim)" }}>
                  <GitBranch size={13} />
                  {gitStatus.branch}
                </span>
              )}
              {changedCount > 0 && (
                <span style={{ color: "var(--yellow)" }}>
                  {changedCount} change{changedCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        )}

        {!projectInfo && (
          <div style={{
            fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em",
            color: "var(--text)", textAlign: "center",
          }}>
            hashmark studio
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <QuickAction icon={<Plus size={14} />} label="New session" onClick={onNewSession} />
          <QuickAction icon={<FolderOpen size={14} />} label="Open project" onClick={openProject} />
          <QuickAction icon={<Bot size={14} />} label="Agents" onClick={() => navigate("/agents")} />
          <QuickAction icon={<FileCode size={14} />} label="Generate" onClick={() => navigate("/generate")} />
        </div>

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="label" style={{ marginBottom: 4, paddingLeft: 2 }}>Recent</div>
            {recentSessions.map(s => (
              <button key={s.id} className="hoverable"
                onClick={() => window.dispatchEvent(new CustomEvent("studio:switch-session", { detail: s.id }))}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "8px 12px",
                  border: "1px solid var(--border-dim)", borderRadius: "var(--radius-lg)",
                  background: "transparent", cursor: "pointer", textAlign: "left", width: "100%",
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ fontSize: 13, color: "var(--text-dim)" }}>
                    {s.title || "Untitled session"}
                  </div>
                  <div className="truncate" style={{ fontSize: 11, color: "var(--text-dimmer)", marginTop: 2 }}>
                    {s.last_message || `${s.message_count} message${s.message_count !== 1 ? "s" : ""}`}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-dimmer)", flexShrink: 0 }}>
                  {timeAgo(s.updated_at)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Suggestions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="label" style={{ marginBottom: 4, paddingLeft: 2 }}>Suggestions</div>
          {SUGGESTIONS.map(text => (
            <button key={text} className="hoverable"
              onClick={() => window.dispatchEvent(new CustomEvent("studio:suggest", { detail: { text } }))}
              style={{
                fontSize: 12.5, color: "var(--text-dimmer)", padding: "8px 12px",
                border: "1px solid var(--border-dim)", borderRadius: "var(--radius-lg)",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                background: "transparent", textAlign: "left", width: "100%",
              }}>
              <ArrowRight size={12} style={{ flexShrink: 0, color: "var(--text-dimmer)" }} />
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button className="hoverable" onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "8px 16px", border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-lg)", background: "transparent",
      cursor: "pointer", fontSize: 12, color: "var(--text-dim)",
    }}>
      {icon}
      {label}
    </button>
  );
}

export function ResumedDivider({ timestamp }: { timestamp: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", userSelect: "none" }}>
      <div style={{ flex: 1, height: 1, background: "var(--border-dim)" }} />
      <span style={{ fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
        Resumed session {"\u00b7"} {new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border-dim)" }} />
    </div>
  );
}
