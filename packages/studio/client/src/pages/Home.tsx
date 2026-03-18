import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Play, GitBranch, History, Bot, FileText, Clock, CheckCircle, XCircle, Loader } from "lucide-react";
import { SkeletonCard, SkeletonLine, SkeletonBlock } from "../components/Skeleton";

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

const DEPT_COLORS: Record<string, string> = {
  engineering: "var(--blue)",
  product: "#8b5cf6",
  design: "#ec4899",
  marketing: "var(--yellow)",
  sales: "var(--accent)",
  operations: "#6366f1",
  pr: "#06b6d4",
};

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

function formatDuration(startMs: number): string {
  const diff = Math.floor((Date.now() - startMs) / 1000);
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
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
      setInfo(infoData);
      setAgents(agentsData.agents ?? []);
      const snaps: ScanSnapshot[] = historyData.snapshots ?? [];
      setSnapshot(snaps[0] ?? null);
      setStaleness(stalenessData);
    }).finally(() => setLoading(false));

    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => setRuns((d.runs ?? []).slice(0, 5)))
      .catch(() => {})
      .finally(() => setRunsLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group agents by department
  const byDept = agents.reduce<Record<string, Agent[]>>((acc, a) => {
    if (!acc[a.department]) acc[a.department] = [];
    acc[a.department].push(a);
    return acc;
  }, {});
  const depts = Object.entries(byDept).sort((a, b) => b[1].length - a[1].length);

  const lastRunAt = runs[0]?.created_at ?? null;
  const lastScanAt = snapshot?.scannedAt ?? null;

  // Compute avg complexity score placeholder — aiReadiness as proxy
  const avgComplexity = snapshot?.aiReadiness != null ? `${snapshot.aiReadiness}%` : "—";

  return (
    <div style={{ padding: "32px", maxWidth: "1040px" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>
          hashmark studio
        </div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)" }}>
          {loading ? <SkeletonLine width={180} height={22} /> : (info?.projectName ?? "Project")}
        </h1>
        {info && (
          <div style={{ fontSize: "11px", color: "var(--text-dimmer)", marginTop: "4px", fontFamily: "var(--font)" }}>
            {info.projectDir}
          </div>
        )}
      </div>

      {/* Top row — 3 stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
        {/* Context health */}
        <div style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
          padding: "16px",
        }}>
          <div style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
            Context Health
          </div>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <SkeletonLine width={80} height={20} />
              <SkeletonLine width={120} height={11} />
              <SkeletonLine width={100} height={11} />
            </div>
          ) : (
            <>
              <div style={{ marginBottom: "8px" }}>
                <FreshnessTag staleness={staleness} />
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "4px", fontFamily: "var(--font)" }}>
                {snapshot
                  ? `~${Math.round((snapshot.totalLines * 5) / 1000)}k tokens est.`
                  : "No scan yet"}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
                {lastScanAt
                  ? `Last scanned ${formatRelativeTime(lastScanAt)}`
                  : "Never scanned"}
              </div>
            </>
          )}
        </div>

        {/* Recent activity */}
        <div style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
          padding: "16px",
        }}>
          <div style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
            Recent Activity
          </div>
          {runsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <SkeletonLine width="90%" height={13} />
              <SkeletonLine width={80} height={11} />
            </div>
          ) : runs.length > 0 ? (
            <>
              <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "6px", lineHeight: 1.4 }}>
                <span style={{ fontFamily: "var(--font)", fontSize: "12px" }}>
                  {runs[0].task.length > 60 ? runs[0].task.slice(0, 60) + "…" : runs[0].task}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <StatusDot status={runs[0].status} />
                <span style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
                  {formatRelativeTime(runs[0].created_at)}
                </span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: "12px", color: "var(--text-dimmer)" }}>No runs yet</div>
          )}
          {lastRunAt && (
            <div style={{ marginTop: "8px" }}>
              <button
                onClick={() => navigate("/history")}
                style={{ background: "none", border: "none", color: "var(--blue)", fontSize: "11px", cursor: "pointer", padding: 0 }}
              >
                View all runs →
              </button>
            </div>
          )}
        </div>

        {/* Project size */}
        <div style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
          padding: "16px",
        }}>
          <div style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
            Project Size
          </div>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <SkeletonLine width={100} height={20} />
              <SkeletonLine width={80} height={11} />
              <SkeletonLine width={110} height={11} />
            </div>
          ) : snapshot ? (
            <>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "6px" }}>
                {snapshot.totalFiles.toLocaleString()}
                <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--text-dimmer)", marginLeft: "6px" }}>files</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "4px", fontFamily: "var(--font)" }}>
                {snapshot.totalLines.toLocaleString()} lines
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

      {/* Quick actions bar */}
      <div style={{ marginBottom: "28px" }}>
        <SectionHeader>Quick Actions</SectionHeader>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <QuickAction
            icon={<Zap size={13} />}
            label="Scan project"
            shortcut="⌘S"
            primary
            onClick={() => navigate("/generate")}
          />
          <QuickAction
            icon={<Play size={13} />}
            label="Run agent"
            shortcut="⌘R"
            onClick={() => navigate("/run")}
          />
          <QuickAction
            icon={<GitBranch size={13} />}
            label="Launch swarm"
            shortcut="⌘W"
            onClick={() => navigate("/swarm")}
          />
          <QuickAction
            icon={<History size={13} />}
            label="View history"
            shortcut="⌘H"
            onClick={() => navigate("/history")}
          />
        </div>
      </div>

      {/* Bottom split: recent runs + agent roster */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "20px" }}>
        {/* Recent runs — left 60% */}
        <div>
          <SectionHeader>Recent Runs</SectionHeader>
          {runsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <SkeletonBlock key={i} height={48} style={{ borderRadius: "var(--radius)" }} />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <EmptyState
              icon={<History size={22} />}
              title="No runs yet"
              body="Start a run from the Run Agent page."
              action="Run agent"
              onAction={() => navigate("/run")}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>

        {/* Agent roster — right 40% */}
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

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={42} style={{ borderRadius: "var(--radius)" }} />)}
            </div>
          ) : depts.length === 0 ? (
            <EmptyState
              icon={<Bot size={22} />}
              title="No agents found"
              body=".claude/agents/ is empty."
              action="Generate agents"
              onAction={() => navigate("/generate")}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {depts.map(([dept, deptAgents]) => (
                <DeptRow
                  key={dept}
                  dept={dept}
                  agents={deptAgents}
                  onClick={() => navigate("/agents")}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function QuickAction({
  icon,
  label,
  shortcut,
  primary,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut: string;
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
      <span style={{
        fontSize: "10px",
        opacity: 0.55,
        marginLeft: "2px",
        fontFamily: "var(--font)",
      }}>
        {shortcut}
      </span>
    </button>
  );
}

function RunRow({ run }: { run: Run }) {
  const durationMs = run.created_at;
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
          {formatRelativeTime(durationMs)}
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

function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div style={{
      background: "var(--bg-2)",
      border: "1px dashed var(--border)",
      borderRadius: "var(--radius)",
      padding: "28px 20px",
      textAlign: "center",
    }}>
      <div style={{ color: "var(--text-dimmer)", marginBottom: "10px", display: "flex", justifyContent: "center" }}>
        {icon}
      </div>
      <div style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "4px" }}>{title}</div>
      <div style={{ fontSize: "11px", color: "var(--text-dimmer)", marginBottom: "14px" }}>{body}</div>
      <button className="btn btn-primary" onClick={onAction}>{action}</button>
    </div>
  );
}
