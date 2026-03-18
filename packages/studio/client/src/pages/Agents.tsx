import { useState, useEffect, useRef, useMemo } from "react";
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
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error" | "stopped">("idle");
  const [runMeta, setRunMeta] = useState<{ startedAt: number; durationMs?: number; wordCount?: number } | null>(null);
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
    setRunStatus("running");
    const startedAt = Date.now();
    setRunMeta({ startedAt });

    try {
      const sessRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const sessData = await sessRes.json() as { session: { id: string } };
      const sid = sessData.session.id;

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
        setRunStatus("error");
        setRunMeta(prev => prev ? { ...prev, durationMs: Date.now() - startedAt } : null);
        setRunning(false);
        return;
      }

      const reader = chatRes.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let assembled = "";
      let stopped = false;

      abortRef.current = () => {
        stopped = true;
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
              const evt = JSON.parse(raw) as { type: string; text?: string; success?: boolean };
              if (evt.type === "text" && evt.text) {
                assembled += evt.text;
                setOutput(assembled);
              } else if (evt.type === "done") {
                const status = stopped ? "stopped" : (evt.success ? "done" : "error");
                setRunStatus(status);
                setRunMeta({ startedAt, durationMs: Date.now() - startedAt, wordCount: assembled.trim().split(/\s+/).length });
              }
            } catch {}
          }
        }
      } finally {
        abortRef.current = null;
        setRunning(false);
        if (runStatus === "running") {
          setRunStatus(stopped ? "stopped" : "done");
          setRunMeta(prev => prev ? { ...prev, durationMs: Date.now() - startedAt, wordCount: assembled.trim().split(/\s+/).length } : null);
        }
      }
    } catch {
      setOutput("Error: agent run failed.");
      setRunStatus("error");
      setRunMeta(prev => prev ? { ...prev, durationMs: Date.now() - Date.now() } : null);
      setRunning(false);
    }
  }

  function stopRun() {
    abortRef.current?.();
  }

  const currentModel = MODELS.find((m) => m.id === runModel) ?? MODELS[1];

  // Parse output into typed segments for structured rendering
  type Segment =
    | { type: "h1" | "h2" | "h3"; text: string }
    | { type: "code"; lang: string; content: string }
    | { type: "list"; items: string[] }
    | { type: "para"; text: string };

  const segments = useMemo((): Segment[] => {
    if (!output) return [];
    const result: Segment[] = [];
    const lines = output.split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code block
      if (line.startsWith("```")) {
        const lang = line.slice(3).trim() || "text";
        const contentLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) {
          contentLines.push(lines[i]);
          i++;
        }
        result.push({ type: "code", lang, content: contentLines.join("\n") });
        i++;
        continue;
      }

      // Headings
      const h3 = line.match(/^###\s+(.*)/);
      if (h3) { result.push({ type: "h3", text: h3[1] }); i++; continue; }
      const h2 = line.match(/^##\s+(.*)/);
      if (h2) { result.push({ type: "h2", text: h2[1] }); i++; continue; }
      const h1 = line.match(/^#\s+(.*)/);
      if (h1) { result.push({ type: "h1", text: h1[1] }); i++; continue; }

      // List block — collect consecutive list items
      if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
        const items: string[] = [];
        while (i < lines.length && (lines[i].match(/^[-*]\s+/) || lines[i].match(/^\d+\.\s+/))) {
          items.push(lines[i].replace(/^[-*\d.]+\s+/, ""));
          i++;
        }
        result.push({ type: "list", items });
        continue;
      }

      // Blank line — skip
      if (!line.trim()) { i++; continue; }

      // Paragraph — collect consecutive non-special lines
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].startsWith("#") &&
        !lines[i].startsWith("```") &&
        !lines[i].match(/^[-*]\s+/) &&
        !lines[i].match(/^\d+\.\s+/)
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length) result.push({ type: "para", text: paraLines.join(" ") });
    }

    return result;
  }, [output]);

  function renderInline(text: string) {
    // Render bold and inline code
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={idx} style={{
            background: "var(--bg-3)",
            border: "1px solid var(--border-dim)",
            borderRadius: 2,
            padding: "0 4px",
            fontSize: 11,
            fontFamily: "var(--font)",
            color: "var(--accent)",
          }}>{part.slice(1, -1)}</code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx} style={{ color: "var(--text)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      return <span key={idx}>{part}</span>;
    });
  }

  // #32 — quality guardrails for agent definitions
  const qualityWarnings = useMemo(() => {
    if (!editContent) return [];
    const warnings: Array<{ message: string; severity: "warn" | "error" }> = [];
    const lines = editContent.split("\n");

    if (lines.length > 200) {
      warnings.push({ message: `${lines.length} lines — very long, consider splitting`, severity: "warn" });
    } else if (lines.length > 100) {
      warnings.push({ message: `${lines.length} lines — may cause template anchoring`, severity: "warn" });
    }

    const hasRole = /^#\s+\S|you are\s/im.test(editContent);
    if (!hasRole) {
      warnings.push({ message: "No role definition — add 'You are...' or a heading", severity: "warn" });
    }

    if (/(?:^|\s)(\/src\/|\/app\/|\/components\/|\.tsx|\.ts\b|\.jsx|\.js\b)/.test(editContent)) {
      warnings.push({ message: "Hardcoded file paths — template anchoring risk", severity: "warn" });
    }

    if (/(?:sk-[A-Za-z0-9]{20,}|Bearer\s+\S{20,}|api[_-]?key\s*[:=]\s*['"]?\S{10,})/i.test(editContent)) {
      warnings.push({ message: "Potential secret detected — remove credentials", severity: "error" });
    }

    return warnings;
  }, [editContent]);

  // #56 — classify run failures when run ends in non-done state
  const failureClass = useMemo(() => {
    if (runStatus === "running" || runStatus === "idle") return null;

    if (runStatus === "done") {
      const words = output.trim().split(/\s+/).filter(Boolean).length;
      if (words > 0 && words < 15) {
        return { label: "MINIMAL OUTPUT", color: "var(--yellow)", detail: `Only ${words} words` };
      }
      return null;
    }

    if (!output.trim()) {
      return { label: "NO OUTPUT", color: "var(--red)", detail: "Agent produced nothing" };
    }

    const words = output.trim().split(/\s+/).filter(Boolean).length;
    const hedges = (output.match(/\b(I would|I could|I should|I might|we would|we could)\b/gi) ?? []).length;
    if (hedges > 3 && words > 0 && hedges / words > 0.03) {
      return { label: "PLANNING MODE", color: "var(--yellow)", detail: "Agent planned instead of executing" };
    }

    if (runStatus === "error") {
      if (/\b(cannot|can't|unable to|don't have access|not able to)\b/i.test(output)) {
        return { label: "AGENT BLOCKED", color: "var(--red)", detail: "Capability limitation reported" };
      }
      return { label: "RUN ERROR", color: "var(--red)", detail: "Run ended with error" };
    }

    if (runStatus === "stopped") {
      if (words < 30) return { label: "PREMATURE STOP", color: "var(--yellow)", detail: "Stopped before meaningful output" };
      return { label: "STOPPED", color: "var(--yellow)", detail: `Stopped at ${words} words` };
    }

    return null;
  }, [runStatus, output]);

  const STATUS_BADGE: Record<string, { label: string; color: string }> = {
    done: { label: "DONE", color: "var(--accent)" },
    error: { label: "ERROR", color: "var(--red)" },
    stopped: { label: "STOPPED", color: "var(--yellow)" },
    running: { label: "RUNNING", color: "var(--blue)" },
    idle: { label: "IDLE", color: "var(--text-dimmer)" },
  };

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
              <div style={{ display: "flex", border: "1px solid var(--border-dim)", borderRadius: "var(--radius)", overflow: "hidden" }}>
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
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
              {qualityWarnings.length > 0 && (
                <div style={{
                  borderTop: "1px solid var(--border-dim)",
                  padding: "8px 16px",
                  background: "var(--bg-2)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  flexShrink: 0,
                }}>
                  {qualityWarnings.map((w, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: "var(--font)" }}>
                      <span style={{ color: w.severity === "error" ? "var(--red)" : "var(--yellow)" }}>▲</span>
                      <span style={{ color: w.severity === "error" ? "var(--red)" : "var(--text-dim)" }}>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                        borderRadius: "var(--radius)",
                        minWidth: "160px",
                        overflow: "hidden",
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
                  background: "var(--bg)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Run meta strip */}
                {runMeta && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 16px",
                    borderBottom: "1px solid var(--border-dim)",
                    fontSize: 10,
                    fontFamily: "var(--font)",
                    color: "var(--text-dimmer)",
                    background: "var(--bg-2)",
                    flexShrink: 0,
                  }}>
                    <span style={{
                      color: STATUS_BADGE[runStatus]?.color ?? "var(--text-dimmer)",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                    }}>
                      {STATUS_BADGE[runStatus]?.label}
                    </span>
                    <span>·</span>
                    <span>{currentModel.label}</span>
                    {runMeta.durationMs != null && (
                      <>
                        <span>·</span>
                        <span>{(runMeta.durationMs / 1000).toFixed(1)}s</span>
                      </>
                    )}
                    {runMeta.wordCount != null && (
                      <>
                        <span>·</span>
                        <span>{runMeta.wordCount.toLocaleString()} words</span>
                      </>
                    )}
                    {running && (
                      <span style={{ color: "var(--accent)", marginLeft: "auto" }}>
                        ● streaming
                      </span>
                    )}
                    {!running && failureClass && (
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ color: failureClass.color, fontWeight: 600, letterSpacing: "0.08em" }}>
                          {failureClass.label}
                        </span>
                        <span style={{ color: "var(--text-dimmer)" }}>—</span>
                        <span style={{ color: "var(--text-dimmer)" }}>{failureClass.detail}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Structured output */}
                <div style={{ flex: 1, padding: "16px 20px", overflow: "auto" }}>
                  {running && !output && (
                    <div style={{ color: "var(--text-dimmer)", fontSize: "11px" }}>
                      <span style={{ color: "var(--accent)" }}>●</span> Running...
                    </div>
                  )}

                  {segments.length > 0 && segments.map((seg, idx) => {
                    if (seg.type === "h1") return (
                      <div key={idx} style={{
                        fontSize: 15, fontWeight: 700, color: "var(--text)",
                        marginBottom: 8, marginTop: idx > 0 ? 20 : 0,
                        paddingBottom: 6, borderBottom: "1px solid var(--border-dim)",
                        fontFamily: "var(--font-ui, var(--font))",
                      }}>{seg.text}</div>
                    );
                    if (seg.type === "h2") return (
                      <div key={idx} style={{
                        fontSize: 12, fontWeight: 600, color: "var(--text)",
                        marginBottom: 6, marginTop: idx > 0 ? 16 : 0,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        fontFamily: "var(--font)",
                      }}>{seg.text}</div>
                    );
                    if (seg.type === "h3") return (
                      <div key={idx} style={{
                        fontSize: 11, fontWeight: 600, color: "var(--accent)",
                        marginBottom: 4, marginTop: idx > 0 ? 12 : 0,
                        fontFamily: "var(--font)",
                      }}>{seg.text}</div>
                    );
                    if (seg.type === "code") return (
                      <div key={idx} style={{
                        background: "var(--bg-3)",
                        border: "1px solid var(--border-dim)",
                        borderRadius: 2,
                        margin: "10px 0",
                      }}>
                        {seg.lang !== "text" && (
                          <div style={{
                            padding: "3px 10px",
                            fontSize: 9,
                            color: "var(--text-dimmer)",
                            borderBottom: "1px solid var(--border-dim)",
                            fontFamily: "var(--font)",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}>{seg.lang}</div>
                        )}
                        <pre style={{
                          margin: 0, padding: "10px 12px",
                          fontSize: 11, lineHeight: "1.55",
                          color: "var(--text)", fontFamily: "var(--font)",
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                          overflowX: "auto",
                        }}>{seg.content}</pre>
                      </div>
                    );
                    if (seg.type === "list") return (
                      <ul key={idx} style={{
                        margin: "6px 0", paddingLeft: 0, listStyle: "none",
                      }}>
                        {seg.items.map((item, ii) => (
                          <li key={ii} style={{
                            display: "flex", gap: 8, alignItems: "flex-start",
                            fontSize: 12, lineHeight: "1.55",
                            color: "var(--text-dim)", fontFamily: "var(--font-ui, var(--font))",
                            marginBottom: 3,
                          }}>
                            <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}>›</span>
                            <span>{renderInline(item)}</span>
                          </li>
                        ))}
                      </ul>
                    );
                    if (seg.type === "para") return (
                      <p key={idx} style={{
                        margin: "0 0 8px",
                        fontSize: 12, lineHeight: "1.65",
                        color: "var(--text-dim)", fontFamily: "var(--font-ui, var(--font))",
                      }}>{renderInline(seg.text)}</p>
                    );
                    return null;
                  })}

                  {running && output && (
                    <span style={{ color: "var(--accent)", fontSize: 12 }}>▋</span>
                  )}

                  {!running && !output && runStatus === "idle" && (
                    <div style={{ color: "var(--text-dimmer)", fontSize: "11px" }}>
                      Output will appear here.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
