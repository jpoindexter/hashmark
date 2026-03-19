import { useState, useEffect } from "react";
import { Bot, Play, FileText } from "lucide-react";

interface AgentDetail {
  id: string;
  name: string;
  description: string;
  department: string;
  content: string;
  path: string;
}

export default function AgentDetailViewer() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const payload = (e as CustomEvent<{ id: string } | string>).detail;
      const id = typeof payload === "object" && payload !== null ? payload.id : payload;
      if (id) {
        setAgentId(id);
        setLoading(true);
        fetch(`/api/agents/${encodeURIComponent(id)}`)
          .then(r => r.json())
          .then((d: { agent?: AgentDetail }) => { setAgent(d.agent ?? null); setLoading(false); })
          .catch(() => setLoading(false));
      }
    };
    window.addEventListener("studio:open-agent", handler);
    return () => window.removeEventListener("studio:open-agent", handler);
  }, []);

  if (!agentId || !agent) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-dimmer)", fontSize: 13, fontFamily: "var(--font-ui)",
      }}>
        {loading ? "Loading..." : "Select an agent to view details."}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", fontFamily: "var(--font-ui)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Bot size={24} style={{ color: "var(--accent)" }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{agent.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {agent.department}
          </div>
        </div>
      </div>

      {/* Description */}
      {agent.description && (
        <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 20 }}>
          {agent.description}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("studio:run-agent", { detail: agent.id }))}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", fontSize: 12, fontWeight: 600,
            background: "var(--accent)", color: "var(--bg)", border: "none",
            borderRadius: "var(--radius)", cursor: "pointer",
          }}
        >
          <Play size={12} /> Run Agent
        </button>
        <button
          onClick={() => {
            if (agent.path) {
              window.dispatchEvent(new CustomEvent("studio:open-file", { detail: agent.path }));
            }
          }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", fontSize: 12,
            background: "var(--bg-3)", color: "var(--text-dim)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", cursor: "pointer",
          }}
        >
          <FileText size={12} /> View Source
        </button>
      </div>

      {/* Agent prompt content */}
      <div style={{
        fontSize: 10, fontWeight: 600, color: "var(--text-dimmer)", textTransform: "uppercase",
        letterSpacing: "0.1em", marginBottom: 8,
      }}>
        System Prompt
      </div>
      <pre style={{
        margin: 0, padding: 16, fontSize: 12, fontFamily: "var(--font)",
        color: "var(--text-dim)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
        background: "var(--bg-2)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-dim)",
      }}>
        {agent.content || "No system prompt defined."}
      </pre>
    </div>
  );
}
