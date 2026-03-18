import { useState, useEffect, useRef } from "react";
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

const MODELS = [
  { id: "claude-opus-4-6", label: "Opus 4.6", note: "1M ctx" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "default" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", note: "fast" },
];

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState(ALL_DEPTS);
  const [search, setSearch] = useState("");

  // Run mode state
  const [tab, setTab] = useState<"edit" | "run">("edit");
  const [runPrompt, setRunPrompt] = useState("");
  const [runModel, setRunModel] = useState("claude-sonnet-4-6");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .finally(() => setLoading(false));
  }, []);

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen]);

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const departments = [ALL_DEPTS, ...Array.from(new Set(agents.map((a) => a.department))).sort()];

  const filtered = agents.filter((a) => {
    const matchDept = filter === ALL_DEPTS || a.department === filter;
    const matchSearch = !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase());
    return matchDept && matchSearch;
  });

  const grouped: Record<string, Agent[]> = {};
  for (const agent of filtered) {
    if (!grouped[agent.department]) grouped[agent.department] = [];
    grouped[agent.department].push(agent);
  }

  function openAgent(agent: Agent) {
    setSelected(agent);
    setEditContent(agent.content);
    setTab("edit");
    setOutput("");
    setRunPrompt("");
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
      setAgents((prev) => prev.map((a) => a.id === selected.id ? { ...a, content: editContent } : a));
      setSelected(null);
    } finally {
      setSaving(false);
    }
  }

  async function runAgent() {
    if (!selected || !runPrompt.trim() || running) return;

    setRunning(true);
    setOutput("");

    try {
      // Create session
      const sessRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const sessData = await sessRes.json() as { session: { id: string } };
      const sid = sessData.session.id;

      // Start chat with agent content as system prompt
      const chatRes = await fetch(`/api/sessions/${sid}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: runPrompt.trim(),
          model: runModel,
          systemPrompt: selected.content,
        }),
      });

      if (!chatRes.ok || !chatRes.body) {
        setOutput("Error: failed to start agent run.");
        setRunning(false);
        return;
      }

      const reader = chatRes.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let assembled = "";

      abortRef.current = () => {
        reader.cancel().catch(() => {});
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const evt = JSON.parse(raw) as { type: string; text?: string };
              if (evt.type === "text" && evt.text) {
                assembled += evt.text;
                setOutput(assembled);
              }
            } catch {}
          }
        }
      } finally {
        abortRef.current = null;
        setRunning(false);
      }
    } catch {
      setOutput("Error: agent run failed.");
      setRunning(false);
    }
  }

  function stopRun() {
    abortRef.current?.();
  }

  const currentModel = MODELS.find((m) => m.id === runModel) ?? MODELS[1];

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
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {/* Tabs */}
              <div style={{ display: "flex", border: "1px solid var(--border-dim)" }}>
                {(["edit", "run"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      padding: "4px 12px",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      background: tab === t ? "var(--accent-bg)" : "none",
                      border: "none",
                      borderRight: t === "edit" ? "1px solid var(--border-dim)" : "none",
                      color: tab === t ? "var(--accent)" : "var(--text-dimmer)",
                      cursor: "pointer",
                      fontFamily: "var(--font)",
                      transition: "all 0.1s",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "edit" && (
                <button className="btn btn-primary" onClick={saveAgent} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
              <button className="btn" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
          </div>

          {/* EDIT tab */}
          {tab === "edit" && (
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
          )}

          {/* RUN tab */}
          {tab === "run" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Controls */}
              <div style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border-dim)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}>
                <textarea
                  value={runPrompt}
                  onChange={(e) => setRunPrompt(e.target.value)}
                  placeholder="Enter a prompt for this agent..."
                  disabled={running}
                  rows={3}
                  style={{
                    resize: "none",
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "8px 10px",
                    fontSize: "12px",
                    lineHeight: "1.5",
                    color: "var(--text)",
                    fontFamily: "var(--font)",
                    outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {/* Model selector */}
                  <div ref={modelRef} style={{ position: "relative" }}>
                    <button
                      onClick={() => setModelOpen((v) => !v)}
                      disabled={running}
                      style={{
                        background: "none",
                        border: "1px solid var(--border-dim)",
                        color: "var(--text-dimmer)",
                        fontFamily: "var(--font)",
                        fontSize: "10px",
                        padding: "4px 10px",
                        cursor: running ? "not-allowed" : "pointer",
                        letterSpacing: "0.04em",
                        transition: "all 0.1s",
                        opacity: running ? 0.5 : 1,
                      }}
                    >
                      ▾ {currentModel.label}
                    </button>
                    {modelOpen && (
                      <div style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        zIndex: 200,
                        background: "var(--bg-3)",
                        border: "1px solid var(--border)",
                        minWidth: "160px",
                      }}>
                        {MODELS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => { setRunModel(m.id); setModelOpen(false); }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              width: "100%",
                              padding: "6px 10px",
                              background: "none",
                              border: "none",
                              borderLeft: m.id === runModel ? "2px solid var(--accent)" : "2px solid transparent",
                              color: m.id === runModel ? "var(--accent)" : "var(--text-dim)",
                              fontFamily: "var(--font)",
                              fontSize: "11px",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "background 0.1s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-4)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                          >
                            <span>{m.label}</span>
                            <span style={{ color: "var(--text-dimmer)", fontSize: "10px" }}>{m.note}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1 }} />

                  {running ? (
                    <button
                      onClick={stopRun}
                      style={{
                        background: "none",
                        border: "1px solid var(--red)",
                        color: "var(--red)",
                        fontFamily: "var(--font)",
                        fontSize: "10px",
                        padding: "4px 14px",
                        cursor: "pointer",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        transition: "all 0.1s",
                      }}
                    >
                      ■ STOP
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => void runAgent()}
                      disabled={!runPrompt.trim() || running}
                      style={{ fontSize: "10px", padding: "4px 14px" }}
                    >
                      &gt; RUN
                    </button>
                  )}
                </div>
              </div>

              {/* Output area */}
              <div
                ref={outputRef}
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "16px 20px",
                  background: "var(--bg)",
                }}
              >
                {running && !output && (
                  <div style={{ color: "var(--text-dimmer)", fontSize: "11px" }}>
                    <span style={{ color: "var(--accent)" }}>●</span> Running...
                  </div>
                )}
                {output && (
                  <pre style={{
                    margin: 0,
                    fontSize: "12px",
                    lineHeight: "1.6",
                    color: "var(--text)",
                    fontFamily: "var(--font)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}>
                    {output}
                    {running && <span style={{ color: "var(--accent)", animation: "none" }}>▋</span>}
                  </pre>
                )}
                {!running && !output && (
                  <div style={{ color: "var(--text-dimmer)", fontSize: "11px" }}>
                    Output will appear here.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
