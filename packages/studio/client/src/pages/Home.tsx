import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ScanProgress, { type ScanResult } from "../components/ScanProgress";

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

const DEPT_COLORS: Record<string, string> = {
  engineering: "#3b82f6",
  product: "#8b5cf6",
  design: "#ec4899",
  marketing: "#f59e0b",
  sales: "#10b981",
  operations: "#6366f1",
  pr: "#06b6d4",
};

export default function Home() {
  const navigate = useNavigate();
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/info").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
    ])
      .then(([infoData, agentsData]) => {
        setInfo(infoData);
        setAgents(agentsData.agents ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  // Group agents by department
  const byDept = agents.reduce<Record<string, Agent[]>>((acc, a) => {
    if (!acc[a.department]) acc[a.department] = [];
    acc[a.department].push(a);
    return acc;
  }, {});

  const depts = Object.entries(byDept).sort((a, b) => b[1].length - a[1].length);
  const hasAgents = agents.length > 0;

  if (scanning) {
    return (
      <ScanProgress
        onComplete={(result) => {
          setScanResult(result);
          setScanning(false);
        }}
        onError={(err) => {
          setScanError(err);
          setScanning(false);
        }}
        onCancel={() => setScanning(false)}
      />
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>
          hashmark studio
        </div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)" }}>
          {loading ? "..." : (info?.projectName ?? "Project")}
        </h1>
        {info && (
          <div style={{ fontSize: "11px", color: "var(--text-dimmer)", marginTop: "6px" }}>
            {info.projectDir}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "32px" }}>
        <StatCard label="Total Agents" value={loading ? "—" : String(agents.length)} accent />
        <StatCard label="Departments" value={loading ? "—" : String(depts.length)} />
        <StatCard label="Status" value={hasAgents ? "ACTIVE" : "EMPTY"} color={hasAgents ? "var(--accent)" : "var(--text-dimmer)"} />
      </div>

      {/* Department breakdown */}
      {hasAgents ? (
        <>
          <SectionHeader>Agent Company</SectionHeader>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px", marginBottom: "32px" }}>
            {depts.map(([dept, deptAgents]) => (
              <div
                key={dept}
                onClick={() => navigate("/agents")}
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius)",
                  padding: "14px",
                  cursor: "pointer",
                  transition: "border-color 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = DEPT_COLORS[dept] ?? "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-dim)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                    color: DEPT_COLORS[dept] ?? "var(--text-dim)",
                  }}>
                    {dept}
                  </span>
                  <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)" }}>
                    {deptAgents.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {deptAgents.slice(0, 4).map((a) => (
                    <span key={a.id} style={{
                      fontSize: "10px",
                      color: "var(--text-dimmer)",
                      padding: "2px 6px",
                      background: "var(--bg-4)",
                      borderRadius: "var(--radius)",
                    }}>
                      {a.name || a.id}
                    </span>
                  ))}
                  {deptAgents.length > 4 && (
                    <span style={{ fontSize: "10px", color: "var(--text-dimmer)", padding: "2px 6px" }}>
                      +{deptAgents.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        !loading && (
          <div style={{
            background: "var(--bg-2)",
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius)",
            padding: "40px",
            textAlign: "center",
            marginBottom: "24px",
          }}>
            <div style={{ fontSize: "28px", marginBottom: "12px" }}>▣</div>
            <div style={{ fontSize: "14px", color: "var(--text-dim)", marginBottom: "6px" }}>
              No agents found
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-dimmer)", marginBottom: "20px" }}>
              .claude/agents/ is empty or doesn't exist
            </div>
            <button className="btn btn-primary" onClick={() => navigate("/generate")}>
              ⟳ Generate Agents
            </button>
          </div>
        )
      )}

      {/* Scan result banner */}
      {scanResult && (
        <div style={{
          background: "var(--accent-bg)",
          border: "1px solid var(--accent-border)",
          borderRadius: "var(--radius)",
          padding: "12px 16px",
          marginBottom: "24px",
          fontSize: "12px",
          color: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span>✓ Scan complete</span>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dimmer)", fontSize: "14px", lineHeight: 1 }}
            onClick={() => setScanResult(null)}
          >×</button>
        </div>
      )}

      {/* Scan error banner */}
      {scanError && (
        <div style={{
          background: "var(--red-bg)",
          border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: "var(--radius)",
          padding: "12px 16px",
          marginBottom: "24px",
          fontSize: "12px",
          color: "var(--red)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span>✕ {scanError}</span>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: "14px", lineHeight: 1 }}
            onClick={() => setScanError(null)}
          >×</button>
        </div>
      )}

      {/* Quick actions */}
      <SectionHeader>Quick Actions</SectionHeader>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => navigate("/generate")}>
          ⟳ Generate Agents
        </button>
        <button className="btn" onClick={() => navigate("/agents")}>
          ▣ View Agents
        </button>
        <button className="btn" onClick={() => { setScanResult(null); setScanError(null); setScanning(true); }}>
          ◎ Run Scan
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, color }: {
  label: string;
  value: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div style={{
      background: "var(--bg-2)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius)",
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{
        fontSize: "24px",
        fontWeight: 700,
        color: color ?? (accent ? "var(--accent)" : "var(--text)"),
        letterSpacing: "-0.02em",
      }}>
        {value}
      </div>
    </div>
  );
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
