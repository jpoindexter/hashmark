import { useState, useRef } from "react";
import AgentCard from "../components/AgentCard.tsx";

const COMPANY_TYPES = [
  { id: "saas", label: "SaaS / Tech Startup", hint: "software product, subscription revenue" },
  { id: "agency", label: "Agency", hint: "client services, project-based work" },
  { id: "social-media-agency", label: "Social Media Agency", hint: "content, influencer, paid social" },
  { id: "design-studio", label: "Design Studio", hint: "brand identity, product design" },
  { id: "sales-org", label: "Sales Organization", hint: "outbound, account management" },
  { id: "ecommerce", label: "E-commerce", hint: "online store, DTC, marketplace" },
  { id: "ai-product", label: "AI Product", hint: "LLM-powered product, AI-first features" },
  { id: "custom", label: "Custom", hint: "pick your own departments" },
];

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic Claude", hint: "claude-sonnet-4.6" },
  { id: "openai", label: "OpenAI", hint: "gpt-5.4, o3" },
  { id: "gemini", label: "Google Gemini", hint: "gemini-2.0-flash" },
  { id: "xai", label: "xAI Grok", hint: "grok-3" },
  { id: "mistral", label: "Mistral", hint: "mistral-large-latest" },
  { id: "groq", label: "Groq", hint: "llama-3.3-70b" },
  { id: "openai-compatible", label: "OpenAI-compatible", hint: "Ollama, LM Studio, Cursor" },
];

interface GeneratedAgent {
  path: string;
  content: string;
  role: { id: string; title: string; department: string; description: string };
}

type Step = "type" | "provider" | "generating" | "review";

export default function Generate() {
  const [step, setStep] = useState<Step>("type");
  const [companyType, setCompanyType] = useState("saas");
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [agents, setAgents] = useState<GeneratedAgent[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  function addLog(msg: string) {
    setLogs((prev) => [...prev, msg]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function startGeneration() {
    setStep("generating");
    setLogs([]);
    setAgents([]);

    const body = {
      companyType,
      provider,
      apiKey: apiKey || undefined,
      baseURL: baseURL || undefined,
    };

    addLog(`Starting generation for company type: ${companyType}`);
    addLog(`Provider: ${provider || "auto-detected from environment"}`);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.body) {
        addLog("Error: No response stream");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(event);
          } catch {}
        }
      }
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    setStep("review");
  }

  function handleEvent(event: Record<string, unknown>) {
    switch (event.type) {
      case "start":
        addLog(`> ${event.message}`);
        break;
      case "progress":
        addLog(`  ${event.message}`);
        break;
      case "agent": {
        const agent = event as unknown as GeneratedAgent & { type: string };
        setAgents((prev) => [...prev, { path: agent.path, content: agent.content, role: agent.role }]);
        addLog(`  ✓ Generated: ${agent.role?.title ?? agent.path}`);
        break;
      }
      case "done":
        addLog(event.success ? "\n  ✓ Generation complete" : "\n  ✗ Generation failed");
        break;
      case "error":
        addLog(`  ✗ Error: ${event.message}`);
        break;
    }
  }

  async function saveAgents() {
    setSaving(true);
    try {
      const res = await fetch("/api/generate/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents }),
      });
      const data = await res.json() as { ok: boolean; count: number };
      if (data.ok) {
        setSaved(true);
        addLog(`\n  ✓ Saved ${data.count} agents to .claude/agents/`);
      }
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep("type");
    setAgents([]);
    setLogs([]);
    setSaved(false);
    setProvider("");
    setApiKey("");
  }

  return (
    <div style={{ padding: "28px", maxWidth: "900px" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "4px" }}>
          Generate Agents
        </h1>
        <div style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
          Scan your codebase and use AI to generate a full agent company
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "28px", alignItems: "center" }}>
        {(["type", "provider", "generating", "review"] as Step[]).map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 700,
              background: step === s ? "var(--accent)" : "var(--bg-4)",
              color: step === s ? "var(--bg)" : "var(--text-dimmer)",
              transition: "all 0.2s",
            }}>
              {i + 1}
            </div>
            <span style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: step === s ? "var(--text)" : "var(--text-dimmer)",
            }}>
              {s}
            </span>
            {i < 3 && <span style={{ color: "var(--border)", margin: "0 4px" }}>›</span>}
          </div>
        ))}
      </div>

      {/* Step: Company Type */}
      {step === "type" && (
        <div className="fade-in">
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "16px" }}>
            Select your company type:
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px", marginBottom: "24px" }}>
            {COMPANY_TYPES.map((ct) => (
              <div
                key={ct.id}
                onClick={() => setCompanyType(ct.id)}
                style={{
                  padding: "14px",
                  border: "1px solid",
                  borderColor: companyType === ct.id ? "var(--accent)" : "var(--border-dim)",
                  borderRadius: "var(--radius)",
                  background: companyType === ct.id ? "var(--accent-bg)" : "var(--bg-2)",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px", color: "var(--text)" }}>
                  {ct.label}
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>
                  {ct.hint}
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setStep("provider")}>
            Continue →
          </button>
        </div>
      )}

      {/* Step: Provider */}
      {step === "provider" && (
        <div className="fade-in">
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "16px" }}>
            Select AI provider (or leave empty to auto-detect from environment):
          </div>

          {/* Auto-detect option */}
          <div
            onClick={() => setProvider("")}
            style={{
              padding: "12px 14px",
              border: "1px solid",
              borderColor: !provider ? "var(--accent)" : "var(--border-dim)",
              borderRadius: "var(--radius)",
              background: !provider ? "var(--accent-bg)" : "var(--bg-2)",
              cursor: "pointer",
              marginBottom: "8px",
              transition: "all 0.1s",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>Auto-detect</div>
            <div style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>Use env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "8px", marginBottom: "16px" }}>
            {PROVIDERS.map((p) => (
              <div
                key={p.id}
                onClick={() => setProvider(p.id)}
                style={{
                  padding: "12px 14px",
                  border: "1px solid",
                  borderColor: provider === p.id ? "var(--accent)" : "var(--border-dim)",
                  borderRadius: "var(--radius)",
                  background: provider === p.id ? "var(--accent-bg)" : "var(--bg-2)",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>{p.label}</div>
                <div style={{ fontSize: "10px", color: "var(--text-dimmer)" }}>{p.hint}</div>
              </div>
            ))}
          </div>

          {provider && (
            <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <input
                type="password"
                placeholder={`API Key for ${PROVIDERS.find(p => p.id === provider)?.label ?? provider}`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{ width: "100%", maxWidth: "400px" }}
              />
              {provider === "openai-compatible" && (
                <input
                  type="text"
                  placeholder="Base URL (e.g. http://localhost:11434/v1)"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  style={{ width: "100%", maxWidth: "400px" }}
                />
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn" onClick={() => setStep("type")}>← Back</button>
            <button className="btn btn-primary" onClick={startGeneration}>
              ⟳ Generate Agents
            </button>
          </div>
        </div>
      )}

      {/* Step: Generating */}
      {(step === "generating" || step === "review") && (
        <div className="fade-in">
          {/* Terminal log */}
          <div style={{
            background: "var(--bg)",
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius)",
            padding: "16px",
            fontFamily: "var(--font)",
            fontSize: "11px",
            lineHeight: "1.6",
            color: "var(--text-dim)",
            height: "200px",
            overflowY: "auto",
            marginBottom: "20px",
          }}>
            {logs.map((log, i) => (
              <div key={i} style={{
                color: log.includes("✓") ? "var(--accent)" : log.includes("✗") ? "var(--red)" : "var(--text-dim)",
                whiteSpace: "pre-wrap",
              }}>
                {log}
              </div>
            ))}
            {step === "generating" && (
              <span style={{ color: "var(--accent)" }}>
                <span className="cursor" />
              </span>
            )}
            <div ref={logsEndRef} />
          </div>

          {/* Generated agents grid */}
          {agents.length > 0 && (
            <>
              <div style={{
                fontSize: "10px",
                color: "var(--text-dimmer)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: "12px",
                paddingBottom: "8px",
                borderBottom: "1px solid var(--border-dim)",
              }}>
                Generated — {agents.length} agents
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: "8px",
                marginBottom: "20px",
                maxHeight: "400px",
                overflowY: "auto",
              }}>
                {agents.map((agent, i) => (
                  <AgentCard
                    key={agent.path}
                    agent={{
                      id: agent.path,
                      name: agent.role?.title ?? agent.path,
                      description: agent.role?.description ?? "",
                      department: agent.role?.department ?? "general",
                      path: agent.path,
                      content: agent.content,
                    }}
                    streaming={step === "generating" && i === agents.length - 1}
                  />
                ))}
              </div>
            </>
          )}

          {/* Actions */}
          {step === "review" && (
            <div style={{ display: "flex", gap: "8px" }}>
              {!saved ? (
                <button
                  className="btn btn-primary"
                  onClick={saveAgents}
                  disabled={saving || agents.length === 0}
                >
                  {saving ? "Saving..." : `Save ${agents.length} Agents`}
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ color: "var(--accent)", fontSize: "12px" }}>
                    ✓ Saved to .claude/agents/
                  </span>
                  <button className="btn" onClick={reset}>Generate again</button>
                </div>
              )}
              <button className="btn" onClick={reset}>Start over</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
