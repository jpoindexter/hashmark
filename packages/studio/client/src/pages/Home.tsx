import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Play, GitBranch, History, Bot, Clock, CheckCircle, XCircle, Loader } from "lucide-react";
import { SkeletonCard, SkeletonLine, SkeletonBlock } from "../components/Skeleton";

// ── Types ───────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  description: string;
  department: string;
  path: string;
}

interface ProjectInfo {
  projectName: string;
  projectDir: string;
}

interface ScanSnapshot {
  scannedAt: number;
  totalFiles: number;
  totalLines: number;
  componentCount: number;
  apiRouteCount: number;
  aiReadiness: number | null;
  hubFileCount: number;
}

interface Run {
  id: string;
  task: string;
  status: string;
  created_at: number;
  worktree_branch: string | null;
}

interface Staleness {
  exists: boolean;
  generatedAt: string | null;
  commitsSince: number | null;
  daysStale: number | null;
}

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "studio:recent_projects";

const DEPT_COLORS: Record<string, string> = {
  engineering: "var(--blue)",
  product: "#8b5cf6",
  design: "#ec4899",
  marketing: "var(--yellow)",
  sales: "var(--accent)",
  operations: "#6366f1",
  pr: "#06b6d4",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function loadRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentProject[]) : [];
  } catch {
    return [];
  }
}

// ── Sub-components ──────────────────────────────────────────────────────────

function FolderIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "complete" ? "var(--accent)" :
    status === "error" ? "var(--red)" :
    status === "running" ? "var(--blue)" :
    "var(--text-dimmer)";
  const icon =
    status === "complete" ? <CheckCircle size={12} /> :
    status === "error" ? <XCircle size={12} /> :
    status === "running" ? <Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> :
    <Clock size={12} />;
  return <span style={{ color, display: "flex", alignItems: "center" }}>{icon}</span>;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "10px",
      color: "var(--text-dimmer)",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      marginBottom: "12px",
      paddingBottom: "8px",
      borderBottom: "1px solid var(--border-dim)",
    }}>
      {children}
    </div>
  );
}

function FreshnessTag({ staleness }: { staleness: Staleness | null }) {
  if (!staleness?.exists) {
    return <span className="badge badge-zinc">NO SCAN</span>;
  }
  const isStale =
    (staleness.commitsSince != null && staleness.commitsSince >= 5) ||
    (staleness.daysStale != null && staleness.daysStale >= 14);
  if (isStale) return <span className="badge badge-yellow">STALE</span>;
  return <span className="badge badge-green">FRESH</span>;
}

function QuickAction({
  icon,
  label,
  shortcut,
  primary,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={primary ? "btn btn-primary" : "btn"}
      onClick={onClick}
      style={{ gap: "6px", paddingRight: "10px" }}
    >
      {icon}
      <span>{label}</span>
      {shortcut && (
        <span style={{
          fontSize: "10px",
          opacity: 0.55,
          marginLeft: "2px",
          fontFamily: "var(--font)",
        }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}

function RunRow({ run }: { run: Run }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "10px 12px",
      background: "var(--bg-2)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius)",
      marginBottom: "2px",
    }}>
      <StatusDot status={run.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "12px",
          color: "var(--text)",
          fontFamily: "var(--font)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {run.task || "(no task)"}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>
          {formatRelativeTime(run.created_at)}
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
          {run.id}
        </span>
      </div>
    </div>
  );
}

function DeptRow({
  dept,
  agents,
  onClick,
}: {
  dept: string;
  agents: { id: string; name: string }[];
  onClick: () => void;
}) {
  const color = DEPT_COLORS[dept] ?? "var(--text-dim)";
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 12px",
        background: "var(--bg-2)",
        border: "1px solid var(--border-dim)",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        marginBottom: "2px",
        transition: "border-color 0.1s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = color; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-dim)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Bot size={12} style={{ color }} />
        <span style={{ fontSize: "12px", fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {dept}
        </span>
      </div>
      <span style={{
        fontSize: "11px",
        fontWeight: 600,
        color: "var(--text-dim)",
        background: "var(--bg-4)",
        border: "1px solid var(--border)",
        borderRadius: "100px",
        padding: "1px 7px",
        fontFamily: "var(--font)",
      }}>
        {agents.length}
      </span>
    </div>
  );
}

// ── Folder picker section ────────────────────────────────────────────────────

function FolderPickerSection({ info, onFolderChanged }: {
  info: ProjectInfo | null;
  onFolderChanged: () => void;
}) {
  const [showPathInput, setShowPathInput] = useState(false);
  const [pathValue, setPathValue] = useState("");
  const [pathError, setPathError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChangeFolderClick = async () => {
    if (window.studio?.pickFolder) {
      const picked = await window.studio.pickFolder();
      if (!picked) return;
      await activateFolder(picked);
    } else {
      setShowPathInput(true);
      setPathValue("");
      setPathError(null);
    }
  };

  const activateFolder = async (dir: string) => {
    setSubmitting(true);
    setPathError(null);
    try {
      const createRes = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dir }),
      });
      if (!createRes.ok) {
        const d = await createRes.json() as { error?: string };
        setPathError(d.error ?? "Invalid path");
        setSubmitting(false);
        return;
      }
      const created = await createRes.json() as { workspace?: { id: string } };
      if (created.workspace?.id) {
        await fetch(`/api/workspaces/${created.workspace.id}/activate`, { method: "POST" });
      }
      window.location.reload();
    } catch {
      setPathError("Could not reach server");
      setSubmitting(false);
    }
  };

  const handlePathSubmit = () => {
    const trimmed = pathValue.trim();
    if (!trimmed) return;
    void activateFolder(trimmed);
  };

  return (
    <div style={{ marginBottom: "28px" }}>
      {/* Studio label */}
      <div style={{
        fontSize: "10px",
        color: "var(--text-dimmer)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "8px",
      }}>
        hashmark studio
      </div>

      {/* Project name + path row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontSize: "22px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text)",
            marginBottom: "4px",
            lineHeight: 1.2,
          }}>
            {info == null ? <SkeletonLine width={180} height={22} /> : (info.projectName || "Project")}
          </h1>
          {info && (
            <div style={{
              fontSize: "12px",
              color: "var(--text-dimmer)",
              fontFamily: "var(--font)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "460px",
            }}>
              {info.projectDir}
            </div>
          )}
        </div>

        <button
          className="btn"
          style={{ flexShrink: 0, fontSize: "11px", marginTop: "2px" }}
          onClick={() => void handleChangeFolderClick()}
        >
          <FolderIcon size={12} />
          Change Folder
        </button>
      </div>

      {/* Inline path input (web fallback) */}
      {showPathInput && (
        <div style={{
          marginTop: "12px",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}>
          <input
            type="text"
            value={pathValue}
            autoFocus
            placeholder="/path/to/project"
            onChange={(e) => { setPathValue(e.target.value); setPathError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") handlePathSubmit(); if (e.key === "Escape") setShowPathInput(false); }}
            style={{
              flex: 1,
              background: "var(--bg-3)",
              border: `1px solid ${pathError ? "var(--red)" : "var(--border)"}`,
              color: "var(--text)",
              fontFamily: "var(--font)",
              fontSize: "12px",
              padding: "7px 12px",
              borderRadius: "var(--radius)",
              outline: "none",
            }}
          />
          <button
            className="btn btn-primary"
            style={{ fontSize: "11px", padding: "0 14px" }}
            disabled={submitting || !pathValue.trim()}
            onClick={handlePathSubmit}
          >
            {submitting ? "Opening..." : "Open"}
          </button>
          <button
            className="btn"
            style={{ fontSize: "11px" }}
            onClick={() => setShowPathInput(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {pathError && (
        <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--red)" }}>{pathError}</div>
      )}
    </div>
  );
}

// ── No-agents empty state ────────────────────────────────────────────────────

function NoAgentsEmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div style={{
      border: "1px dashed var(--border-dim)",
      borderRadius: "8px",
      minHeight: "180px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 24px",
      marginBottom: "28px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "28px", marginBottom: "12px", lineHeight: 1 }}>
        <FolderIcon size={28} color="var(--text-dimmer)" />
      </div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-dim)", marginBottom: "4px" }}>
        No agents found
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-dimmer)", marginBottom: "18px" }}>
        .claude/agents/ is empty
      </div>
      <button className="btn btn-primary" onClick={onGenerate}>
        &gt; GENERATE AGENTS
      </button>
    </div>
  );
}

// ── Recent projects ──────────────────────────────────────────────────────────

function RecentProjectsSection() {
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    setRecent(loadRecentProjects());
  }, []);

  if (recent.length === 0) return null;

  const handleOpen = async (proj: RecentProject) => {
    setActivating(proj.path);
    try {
      const createRes = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: proj.path }),
      });
      if (createRes.ok) {
        const created = await createRes.json() as { workspace?: { id: string } };
        if (created.workspace?.id) {
          await fetch(`/api/workspaces/${created.workspace.id}/activate`, { method: "POST" });
        }
      }
      window.location.reload();
    } catch {
      setActivating(null);
    }
  };

  return (
    <div style={{ marginBottom: "28px" }}>
      <SectionHeader>Recent Projects</SectionHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {recent.map((proj) => (
          <button
            key={proj.path}
            onClick={() => void handleOpen(proj)}
            disabled={activating === proj.path}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "9px 12px",
              background: "transparent",
              border: "1px solid transparent",
              borderRadius: "var(--radius)",
              cursor: activating === proj.path ? "wait" : "pointer",
              textAlign: "left",
              width: "100%",
              opacity: activating === proj.path ? 0.6 : 1,
              transition: "background 0.1s, border-color 0.1s",
            }}
            onMouseEnter={(e) => {
              if (activating !== proj.path) {
                e.currentTarget.style.background = "var(--bg-2)";
                e.currentTarget.style.borderColor = "var(--border-dim)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
            }}
          >
            <FolderIcon size={14} color="var(--text-dimmer)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {proj.name}
              </div>
              <div style={{
                fontSize: "11px",
                color: "var(--text-dimmer)",
                fontFamily: "var(--font)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginTop: "1px",
              }}>
                {proj.path}
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dimmer)", flexShrink: 0, whiteSpace: "nowrap" }}>
              {formatRelativeTime(proj.lastOpened)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Stat cards (has-agents state) ────────────────────────────────────────────

function StatCards({
  loading,
  agents,
  snapshot,
  staleness,
  runs,
  runsLoading,
  onViewHistory,
}: {
  loading: boolean;
  agents: Agent[];
  snapshot: ScanSnapshot | null;
  staleness: Staleness | null;
  runs: Run[];
  runsLoading: boolean;
  onViewHistory: () => void;
}) {
  const deptCount = new Set(agents.map((a) => a.department)).size;
  const lastScanAt = snapshot?.scannedAt ?? null;
  const avgComplexity = snapshot?.aiReadiness != null ? `${snapshot.aiReadiness}%` : "—";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
      {/* Agents */}
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-dim)", borderRadius: "var(--radius)", padding: "16px" }}>
        <div style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
          Agents
        </div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SkeletonLine width={60} height={22} />
            <SkeletonLine width={80} height={11} />
          </div>
        ) : (
          <>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "4px" }}>
              {agents.length}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
              {deptCount} department{deptCount !== 1 ? "s" : ""}
            </div>
          </>
        )}
      </div>

      {/* Context health */}
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-dim)", borderRadius: "var(--radius)", padding: "16px" }}>
        <div style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
          Context Health
        </div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SkeletonLine width={80} height={20} />
            <SkeletonLine width={100} height={11} />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: "6px" }}>
              <FreshnessTag staleness={staleness} />
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
              {lastScanAt ? `Scanned ${formatRelativeTime(lastScanAt)}` : "Never scanned"}
            </div>
          </>
        )}
      </div>

      {/* Project size */}
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-dim)", borderRadius: "var(--radius)", padding: "16px" }}>
        <div style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
          Project Size
        </div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SkeletonLine width={100} height={20} />
            <SkeletonLine width={80} height={11} />
          </div>
        ) : snapshot ? (
          <>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "4px" }}>
              {snapshot.totalFiles.toLocaleString()}
              <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--text-dimmer)", marginLeft: "6px" }}>files</span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
              AI Readiness: <span style={{ color: "var(--accent)", fontWeight: 600 }}>{avgComplexity}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: "12px", color: "var(--text-dimmer)" }}>Run a scan to see stats</div>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate();
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [snapshot, setSnapshot] = useState<ScanSnapshot | null>(null);
  const [staleness, setStaleness] = useState<Staleness | null>(null);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(true);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch("/api/info").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/scan/history").then((r) => r.json()),
      fetch("/api/scan/staleness").then((r) => r.json()).catch(() => null),
    ]).then(([infoData, agentsData, historyData, stalenessData]) => {
      setInfo(infoData as ProjectInfo);
      setAgents((agentsData as { agents?: Agent[] }).agents ?? []);
      const snaps: ScanSnapshot[] = (historyData as { snapshots?: ScanSnapshot[] }).snapshots ?? [];
      setSnapshot(snaps[0] ?? null);
      setStaleness(stalenessData as Staleness | null);
    }).finally(() => setLoading(false));

    fetch("/api/run/runs")
      .then((r) => r.json())
      .then((d) => setRuns(((d as { runs?: Run[] }).runs ?? []).slice(0, 5)))
      .catch(() => {})
      .finally(() => setRunsLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const byDept = agents.reduce<Record<string, Agent[]>>((acc, a) => {
    if (!acc[a.department]) acc[a.department] = [];
    acc[a.department].push(a);
    return acc;
  }, {});
  const depts = Object.entries(byDept).sort((a, b) => b[1].length - a[1].length);

  const hasAgents = !loading && agents.length > 0;
  const lastRunAt = runs[0]?.created_at ?? null;

  return (
    <div style={{ padding: "32px 24px", maxWidth: "680px", margin: "0 auto" }}>

      {/* Folder picker header */}
      <FolderPickerSection info={info} onFolderChanged={fetchData} />

      {/* State 1: No agents */}
      {!loading && agents.length === 0 && (
        <>
          <NoAgentsEmptyState onGenerate={() => navigate("/generate")} />

          <RecentProjectsSection />

          <div style={{ marginBottom: "8px" }}>
            <SectionHeader>Start</SectionHeader>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={() => navigate("/generate")}>
                &gt; GENERATE AGENTS
              </button>
              <button className="btn" onClick={() => navigate("/agents")}>
                &#9647; VIEW AGENTS
              </button>
              <button className="btn" onClick={() => navigate("/generate")}>
                @ RUN SCAN
              </button>
            </div>
          </div>
        </>
      )}

      {/* State 2: Has agents (compact) */}
      {hasAgents && (
        <>
          <StatCards
            loading={loading}
            agents={agents}
            snapshot={snapshot}
            staleness={staleness}
            runs={runs}
            runsLoading={runsLoading}
            onViewHistory={() => navigate("/history")}
          />

          {/* Quick actions */}
          <div style={{ marginBottom: "28px" }}>
            <SectionHeader>Quick Actions</SectionHeader>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <QuickAction icon={<Zap size={13} />} label="Scan project" shortcut="⌘S" primary onClick={() => navigate("/generate")} />
              <QuickAction icon={<Play size={13} />} label="Run agent" shortcut="⌘R" onClick={() => navigate("/run")} />
              <QuickAction icon={<GitBranch size={13} />} label="Launch swarm" shortcut="⌘W" onClick={() => navigate("/swarm")} />
              <QuickAction icon={<History size={13} />} label="View history" shortcut="⌘H" onClick={() => navigate("/history")} />
            </div>
          </div>

          {/* Bottom split: recent runs + agent roster */}
          <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "20px", marginBottom: "28px" }}>
            <div>
              <SectionHeader>Recent Runs</SectionHeader>
              {runsLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[0, 1, 2].map((i) => (
                    <SkeletonBlock key={i} height={48} style={{ borderRadius: "var(--radius)" }} />
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <div style={{
                  background: "var(--bg-2)",
                  border: "1px dashed var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "20px",
                  textAlign: "center",
                  fontSize: "12px",
                  color: "var(--text-dimmer)",
                }}>
                  No runs yet
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {runs.map((run) => <RunRow key={run.id} run={run} />)}
                </div>
              )}
              {lastRunAt && (
                <button
                  onClick={() => navigate("/history")}
                  style={{ background: "none", border: "none", color: "var(--blue)", fontSize: "11px", cursor: "pointer", padding: "8px 0 0", display: "block" }}
                >
                  View all runs →
                </button>
              )}
            </div>

            <div>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
                paddingBottom: "8px",
                borderBottom: "1px solid var(--border-dim)",
              }}>
                <span style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Agent Roster
                </span>
                <button
                  onClick={() => navigate("/agents")}
                  style={{ background: "none", border: "none", color: "var(--blue)", fontSize: "11px", cursor: "pointer", padding: 0 }}
                >
                  View all →
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {depts.map(([dept, deptAgents]) => (
                  <DeptRow key={dept} dept={dept} agents={deptAgents} onClick={() => navigate("/agents")} />
                ))}
              </div>
            </div>
          </div>

          <RecentProjectsSection />
        </>
      )}

      {/* Loading skeleton state */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            {[0, 1, 2].map((i) => <SkeletonBlock key={i} height={80} style={{ borderRadius: "var(--radius)" }} />)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={32} style={{ borderRadius: "var(--radius)", width: 100 }} />)}
          </div>
        </div>
      )}
    </div>
  );
}
