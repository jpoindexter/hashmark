import { useState, useEffect } from "react";
import AgentCard from "../components/AgentCard.tsx";

interface Agent {
  id: string;
  name: string;
  description: string;
  department: string;
  path: string;
  content: string;
}

const ALL_DEPTS = "all";

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState(ALL_DEPTS);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .finally(() => setLoading(false));
  }, []);

  const departments = [ALL_DEPTS, ...Array.from(new Set(agents.map((a) => a.department))).sort()];

  const filtered = agents.filter((a) => {
    const matchDept = filter === ALL_DEPTS || a.department === filter;
    const matchSearch = !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase());
    return matchDept && matchSearch;
  });

  // Group by department for display
  const grouped: Record<string, Agent[]> = {};
  for (const agent of filtered) {
    if (!grouped[agent.department]) grouped[agent.department] = [];
    grouped[agent.department].push(agent);
  }

  function openAgent(agent: Agent) {
    setSelected(agent);
    setEditContent(agent.content);
  }

  async function saveAgent() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch(`/api/agents/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      // Update local state
      setAgents((prev) => prev.map((a) => a.id === selected.id ? { ...a, content: editContent } : a));
      setSelected(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Agent list */}
      <div style={{
        flex: 1,
        overflow: "auto",
        padding: "28px",
        borderRight: selected ? "1px solid var(--border-dim)" : "none",
      }}>
        {/* Header */}
        <div style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "4px" }}>
            Agent Company
          </h1>
          <div style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
            {agents.length} agents across {departments.length - 1} departments
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          <input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1", minWidth: "160px", maxWidth: "280px" }}
          />
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {departments.map((d) => (
              <button
                key={d}
                onClick={() => setFilter(d)}
                style={{
                  padding: "5px 10px",
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  border: "1px solid",
                  borderColor: filter === d ? "var(--accent)" : "var(--border-dim)",
                  borderRadius: "var(--radius)",
                  background: filter === d ? "var(--accent-bg)" : "var(--bg-3)",
                  color: filter === d ? "var(--accent)" : "var(--text-dimmer)",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {d === ALL_DEPTS ? "All" : d}
                {d !== ALL_DEPTS && (
                  <span style={{ marginLeft: "5px", opacity: 0.6 }}>
                    {agents.filter((a) => a.department === d).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Agent grid */}
        {loading ? (
          <div style={{ color: "var(--text-dimmer)", padding: "40px 0" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "var(--text-dimmer)", padding: "40px 0" }}>No agents found.</div>
        ) : (
          Object.entries(grouped).sort().map(([dept, deptAgents]) => (
            <div key={dept} style={{ marginBottom: "24px" }}>
              <div style={{
                fontSize: "10px",
                color: "var(--text-dimmer)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: "10px",
                paddingBottom: "6px",
                borderBottom: "1px solid var(--border-dim)",
              }}>
                {dept} — {deptAgents.length}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px" }}>
                {deptAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onClick={() => openAgent(agent)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Agent detail panel */}
      {selected && (
        <div style={{
          width: "480px",
          minWidth: "480px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-2)",
        }}>
          {/* Panel header */}
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-dim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>{selected.name}</div>
              <div style={{ fontSize: "10px", color: "var(--text-dimmer)", marginTop: "2px" }}>
                .claude/agents/{selected.path}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn btn-primary" onClick={saveAgent} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button className="btn" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
          </div>

          {/* Editor */}
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              borderRadius: 0,
              background: "var(--bg)",
              padding: "16px 20px",
              fontSize: "12px",
              lineHeight: "1.6",
              color: "var(--text)",
              fontFamily: "var(--font)",
            }}
          />
        </div>
      )}
    </div>
  );
}
