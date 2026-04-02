import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AgentCard from "../AgentCard.tsx";
import SecurityBanner from "./SecurityBanner";
import type { Agent, AgentStats, SecurityFinding, SortKey } from "./types";

interface AgentListProps {
  agents: Agent[];
  loading: boolean;
  allStats: Record<string, AgentStats>;
  onOpenAgent: (agent: Agent) => void;
  onDeleteAgent: (agent: Agent) => void;
  onDuplicateAgent: (agent: Agent) => void;
  onShowCreate: () => void;
  secScanRunning: boolean;
  secFindings: SecurityFinding[] | null;
  onRunSecurityScan: () => void;
  secDismissed: boolean;
  onDismissFindings: () => void;
}

export default function AgentList({
  agents, loading, allStats, onOpenAgent, onDeleteAgent,
  onDuplicateAgent, onShowCreate, secScanRunning, secFindings,
  onRunSecurityScan, secDismissed, onDismissFindings,
}: AgentListProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const deptDropdownRef = useRef<HTMLDivElement>(null);

  const departments = useMemo(
    () => Array.from(new Set(agents.map((a) => a.department))).sort(),
    [agents],
  );

  const deptCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of agents) map[a.department] = (map[a.department] ?? 0) + 1;
    return map;
  }, [agents]);

  useEffect(() => {
    if (!deptDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) setDeptDropdownOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDeptDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [deptDropdownOpen]);

  function toggleDept(dept: string) {
    setSelectedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept); else next.add(dept);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const base = agents.filter((a) => {
      const matchDept = selectedDepts.size === 0 || selectedDepts.has(a.department);
      const matchSearch = !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase());
      return matchDept && matchSearch;
    });
    return [...base].sort((a, b) => {
      if (sortKey === "name") return (a.name || a.id).localeCompare(b.name || b.id);
      if (sortKey === "lastRun") return (allStats[b.id]?.lastRun ?? 0) - (allStats[a.id]?.lastRun ?? 0);
      if (sortKey === "runCount") return (allStats[b.id]?.totalRuns ?? 0) - (allStats[a.id]?.totalRuns ?? 0);
      return 0;
    });
  }, [agents, selectedDepts, search, sortKey, allStats]);

  const grouped: Record<string, Agent[]> = {};
  for (const agent of filtered) {
    if (!grouped[agent.department]) grouped[agent.department] = [];
    grouped[agent.department].push(agent);
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "28px" }}>
      <div style={{ marginBottom: "20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: "4px" }}>Agents</h1>
          <div style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
            {agents.length} agents across {departments.length} departments
          </div>
        </div>
        <div className="flex-row gap-2" style={{ flexShrink: 0 }}>
          <button className="btn btn-sm" onClick={onRunSecurityScan} disabled={secScanRunning}>
            {secScanRunning ? "scanning..." : "security scan"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={onShowCreate}>+ new agent</button>
        </div>
      </div>

      <SecurityBanner findings={secFindings} dismissed={secDismissed} onDismiss={onDismissFindings} agents={agents} onOpenAgent={onOpenAgent} />

      <div className="flex-row flex-wrap gap-2" style={{ marginBottom: "20px" }}>
        <input placeholder="Search agents..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "1", minWidth: "160px", maxWidth: "240px" }} />
        <DeptDropdown
          selectedDepts={selectedDepts} departments={departments} deptCounts={deptCounts}
          open={deptDropdownOpen} dropdownRef={deptDropdownRef}
          onToggle={() => setDeptDropdownOpen((v) => !v)} onToggleDept={toggleDept}
          onSelectAll={() => setSelectedDepts(new Set(departments))} onClear={() => setSelectedDepts(new Set())}
        />
        <div className="flex-row gap-1" style={{ flexShrink: 0 }}>
          {(["name", "lastRun", "runCount"] as SortKey[]).map((k) => (
            <button key={k} onClick={() => setSortKey(k)} className="text-micro" style={{
              padding: "4px 8px",
              border: "1px solid", borderColor: sortKey === k ? "var(--accent)" : "var(--border-dim)",
              borderRadius: "var(--radius-sm)", background: sortKey === k ? "var(--accent-bg)" : "var(--bg-3)",
              color: sortKey === k ? "var(--accent)" : "var(--text-dimmer)", cursor: "pointer", transition: "all 0.1s",
            }}>
              {k === "name" ? "name" : k === "lastRun" ? "last run" : "run count"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-dimmer)", padding: "40px 0" }}>Loading...</div>
      ) : agents.length === 0 ? (
        <EmptyState onShowCreate={onShowCreate} />
      ) : filtered.length === 0 ? (
        <div style={{ color: "var(--text-dimmer)", padding: "40px 0", fontSize: "12px" }}>No agents match your search.</div>
      ) : (
        Object.entries(grouped).sort().map(([dept, deptAgents]) => (
          <div key={dept} style={{ marginBottom: "24px" }}>
            <div className="label" style={{
              marginBottom: "10px", paddingBottom: "6px",
              borderBottom: "1px solid var(--border-dim)",
            }}>
              {dept} — {deptAgents.length}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px" }}>
              {deptAgents.map((agent) => (
                <AgentCard
                  key={agent.id} agent={agent} stats={allStats[agent.id]}
                  onClick={() => { window.dispatchEvent(new CustomEvent("studio:open-agent", { detail: { id: agent.id } })); }}
                  onRun={() => navigate(`/run?agent=${agent.id}`)}
                  onDelete={() => onDeleteAgent(agent)}
                  onDuplicate={() => onDuplicateAgent(agent)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function EmptyState({ onShowCreate }: { onShowCreate: () => void }) {
  return (
    <div className="flex-col gap-4" style={{
      alignItems: "center", justifyContent: "center",
      padding: "64px 24px", textAlign: "center",
    }}>
      <div className="flex-center" style={{
        width: 48, height: 48, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
        color: "var(--text-dimmer)", fontSize: "22px", background: "var(--bg-2)",
      }}>⬡</div>
      <div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>No agents yet</div>
        <div style={{ fontSize: "12px", color: "var(--text-dimmer)", maxWidth: "320px", lineHeight: "1.6" }}>
          Agents are reusable AI personas with defined skills, constraints, and tools. Create one to run it on any task.
        </div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={onShowCreate}>+ new agent</button>
    </div>
  );
}

function DeptDropdown({ selectedDepts, departments, deptCounts, open, dropdownRef, onToggle, onToggleDept, onSelectAll, onClear }: {
  selectedDepts: Set<string>; departments: string[]; deptCounts: Record<string, number>;
  open: boolean; dropdownRef: React.RefObject<HTMLDivElement | null>;
  onToggle: () => void; onToggleDept: (dept: string) => void; onSelectAll: () => void; onClear: () => void;
}) {
  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button onClick={onToggle} className="label flex-row gap-2" style={{
        padding: "5px 10px",
        border: "1px solid",
        borderColor: selectedDepts.size > 0 ? "var(--accent)" : "var(--border-dim)", borderRadius: "var(--radius)",
        background: selectedDepts.size > 0 ? "var(--accent-bg)" : "var(--bg-3)",
        color: selectedDepts.size > 0 ? "var(--accent)" : "var(--text-dimmer)",
        cursor: "pointer", transition: "all 0.1s", maxWidth: 200, whiteSpace: "nowrap", fontFamily: "var(--font)",
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {selectedDepts.size === 0 ? "All departments" : `${selectedDepts.size} selected`}
        </span>
        <span style={{ fontSize: 8, transition: "transform 0.1s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </button>
      {open && (
        <div className="dropdown-animate" style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100,
          background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          minWidth: 200, maxHeight: 320, overflowY: "auto", boxShadow: "var(--shadow-md)",
        }}>
          <div className="text-micro flex-between" style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-dim)", fontFamily: "var(--font)" }}>
            <button onClick={onSelectAll} className="hoverable text-micro" style={{ background: "none", border: "none", fontFamily: "var(--font)", padding: 0 }}>select all</button>
            <button onClick={onClear} className="hoverable text-micro" style={{ background: "none", border: "none", fontFamily: "var(--font)", padding: 0 }}>clear</button>
          </div>
          {departments.map((dept) => {
            const checked = selectedDepts.has(dept);
            return (
              <button key={dept} onClick={() => onToggleDept(dept)} className="hoverable flex-row gap-2" style={{
                width: "100%", padding: "6px 10px",
                background: "none", border: "none", fontSize: 11, fontFamily: "var(--font)",
                color: checked ? "var(--text)" : "var(--text-dim)", textAlign: "left",
              }}>
                <span className="flex-center" style={{
                  width: 14, height: 14, borderRadius: 2, border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
                  background: checked ? "var(--accent-bg)" : "none",
                  flexShrink: 0, fontSize: 10, color: "var(--accent)", transition: "all 0.1s",
                }}>{checked ? "✓" : ""}</span>
                <span style={{ flex: 1, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dept}</span>
                <span style={{ fontSize: 10, color: "var(--text-dimmer)", background: "var(--bg-4)", borderRadius: 10, padding: "1px 6px", flexShrink: 0 }}>{deptCounts[dept] ?? 0}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
