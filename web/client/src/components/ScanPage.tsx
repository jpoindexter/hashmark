import { useState } from "react";
import { fetchApi, getToken } from "../lib/api";
import { toast } from "./Toasts";
import type { Agent } from "../types";

interface ScanResult {
  projectDir: string;
  name: string;
  fileCount: number;
  byExtension: Record<string, number>;
  stack: string[];
  frameworks: string[];
  keyFiles: string[];
  packageJson?: { name?: string; description?: string };
  scannedAt: number;
}

const COMPANY_TYPES = ["SaaS", "AI Product", "Developer Tool", "Agency", "E-commerce", "Mobile App", "Data Platform", "Marketplace"];

export function ScanPage() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedAgents, setGeneratedAgents] = useState<Agent[]>([]);
  const [genText, setGenText] = useState("");
  const [companyType, setCompanyType] = useState("SaaS");

  const runScan = async () => {
    setScanning(true);
    try {
      const result = await fetchApi<ScanResult>("/api/scan");
      setScan(result);
      setGeneratedAgents([]);
      setGenText("");
    } catch { toast.error("Scan failed"); }
    finally { setScanning(false); }
  };

  const generateAgents = async () => {
    if (!scan || generating) return;
    setGenerating(true);
    setGenText("");
    setGeneratedAgents([]);

    const token = await getToken();
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ scan, companyType }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { type: string; text?: string; agents?: Agent[]; error?: string };
            if (evt.type === "text" && evt.text) setGenText(p => p + evt.text);
            if (evt.type === "done" && evt.agents) { setGeneratedAgents(evt.agents); toast.success(`${evt.agents.length} agents generated`); }
            if (evt.type === "error") toast.error(evt.error ?? "Generation failed");
          } catch {}
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", padding: "20px 24px", gap: 20, maxWidth: 800 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Codebase Intelligence</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Scan your project and generate a tailored AI agent team.</div>
      </div>

      {/* Scan card */}
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: scan ? 14 : 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>Step 1 — Scan Project</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Analyzes files, stack, frameworks, and project structure.</div>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            style={{
              padding: "7px 16px", fontSize: 12, fontWeight: 600,
              background: scanning ? "var(--bg-elevated)" : "var(--bg-active)",
              color: scanning ? "var(--text-muted)" : "var(--text)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: scanning ? "default" : "pointer",
            }}
          >
            {scanning ? "Scanning..." : scan ? "Re-scan" : "Scan Now"}
          </button>
        </div>

        {scan && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ScanCard label="Project" value={scan.name} />
            <ScanCard label="Files" value={String(scan.fileCount)} />
            <ScanCard label="Stack" value={scan.stack.join(", ") || "—"} />
            <ScanCard label="Frameworks" value={scan.frameworks.join(", ") || "—"} />
            <div style={{ gridColumn: "1 / -1" }}>
              <ScanCard label="Key files" value={scan.keyFiles.join(" · ") || "—"} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>File types</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {Object.entries(scan.byExtension).sort(([, a], [, b]) => b - a).slice(0, 16).map(([ext, n]) => (
                  <span key={ext} style={{ fontSize: 10, padding: "2px 6px", background: "var(--bg-active)", borderRadius: "var(--radius-sm)", color: "var(--text-dim)" }}>
                    {ext} ×{n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Generate card */}
      {scan && (
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>Step 2 — Generate Agent Team</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Claude generates agents tailored to your codebase and company type.</div>
            </div>
            <select
              value={companyType}
              onChange={e => setCompanyType(e.target.value)}
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-dim)", borderRadius: "var(--radius-sm)", padding: "5px 8px", fontSize: 11, cursor: "pointer" }}
            >
              {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={generateAgents}
              disabled={generating}
              style={{
                padding: "7px 16px", fontSize: 12, fontWeight: 600,
                background: generating ? "var(--bg-elevated)" : "var(--accent)",
                color: generating ? "var(--text-muted)" : "var(--text-on-accent)",
                border: "none", borderRadius: "var(--radius-sm)", cursor: generating ? "default" : "pointer",
              }}
            >
              {generating ? "Generating..." : "Generate"}
            </button>
          </div>

          {generating && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[0, 1, 2, 3].map(i => (
                <SkeletonCard key={i} delay={i * 120} />
              ))}
            </div>
          )}

          {!generating && generatedAgents.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 11, color: "var(--green)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13 }}>✓</span>
                {generatedAgents.length} agents created and saved
              </div>
              {generatedAgents.map((a, i) => (
                <AgentCard key={a.id} agent={a} idx={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScanCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: "var(--radius-md)",
      border: "1px solid var(--border)", background: "var(--bg-elevated)",
      animation: `gc-fade-in 0.4s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "var(--radius-sm)", flexShrink: 0,
        background: "var(--bg-active)",
        animation: "pulse 1.4s ease-in-out infinite",
      }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ height: 10, width: "40%", borderRadius: "var(--radius-sm)", background: "var(--bg-active)", animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ height: 8, width: "70%", borderRadius: "var(--radius-sm)", background: "var(--bg-hover)", animation: "pulse 1.4s ease-in-out 0.2s infinite" }} />
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
    </div>
  );
}

const AGENT_COLORS = ["var(--accent)", "var(--blue)", "var(--green)", "var(--orange)", "var(--yellow)"];

function AgentCard({ agent, idx }: { agent: { id: string; name: string; description: string | null; system_prompt: string }; idx: number }) {
  const initials = agent.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const color = AGENT_COLORS[idx % AGENT_COLORS.length];

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 12px", borderRadius: "var(--radius-md)",
      border: "1px solid var(--border)", background: "var(--bg-elevated)",
      animation: `gc-fade-in 0.45s cubic-bezier(0.16,1,0.3,1) ${idx * 60}ms both`,
      transition: "border-color var(--transition)",
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: "var(--radius-sm)", flexShrink: 0,
        background: color, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, color: "var(--text-on-accent)", letterSpacing: "0.02em",
        opacity: 0.9,
      }}>
        {initials}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{agent.name}</div>
        {agent.description && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{agent.description}</div>
        )}
      </div>

      {/* Prompt peek */}
      <div style={{
        fontSize: 10, color: "var(--text-muted)", flexShrink: 0, alignSelf: "center",
        background: "var(--bg-active)", borderRadius: "var(--radius-sm)", padding: "2px 7px",
        fontFamily: "var(--font-mono)",
      }}>
        {agent.system_prompt.length > 0 ? `${Math.round(agent.system_prompt.length / 4)} tokens` : "—"}
      </div>
    </div>
  );
}
