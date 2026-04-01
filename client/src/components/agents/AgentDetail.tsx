import { useState, useMemo } from "react";
import type { Agent } from "./types";
import AgentEditor from "./AgentEditor";
import AgentRunner from "./AgentRunner";

interface AgentDetailProps {
  agent: Agent;
  editContent: string;
  onEditContent: (content: string) => void;
  onSave: () => void;
  saving: boolean;
  onClose: () => void;
}

export default function AgentDetail({ agent, editContent, onEditContent, onSave, saving, onClose }: AgentDetailProps) {
  const [tab, setTab] = useState<"edit" | "run" | "gov">("edit");

  return (
    <div style={{
      width: "480px", minWidth: "480px", display: "flex", flexDirection: "column",
      overflow: "hidden", background: "var(--bg-2)",
    }}>
      <div style={{
        padding: "16px 20px", borderBottom: "1px solid var(--border-dim)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 600 }}>{agent.name}</div>
          <div style={{ fontSize: "10px", color: "var(--text-dimmer)", marginTop: "2px" }}>
            .claude/agents/{agent.path}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ display: "flex", border: "1px solid var(--border-dim)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            {(["edit", "run", "gov"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "4px 12px", fontSize: "10px", textTransform: "uppercase",
                  letterSpacing: "0.08em", background: tab === t ? "var(--accent-bg)" : "none",
                  border: "none", borderRight: t !== "gov" ? "1px solid var(--border-dim)" : "none",
                  color: tab === t ? "var(--accent)" : "var(--text-dimmer)", cursor: "pointer",
                  fontFamily: "var(--font)", transition: "all 0.1s",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "edit" && (
            <button className="btn btn-primary" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          )}
          <button className="btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {tab === "edit" && (
        <AgentEditor agent={agent} editContent={editContent} onEditContent={onEditContent} />
      )}
      {tab === "run" && (
        <AgentRunner agent={agent} />
      )}
      {tab === "gov" && (
        <GovTab agent={agent} />
      )}
    </div>
  );
}

function GovTab({ agent }: { agent: Agent }) {
  const govInfo = useMemo(() => {
    const content = agent.content;
    if (!content) return null;

    const headingMatch = content.match(/^#\s+(.+)/m);
    const roleMatch = content.match(/you are\s+([^.\n]{10,80})/i);
    const role = headingMatch?.[1] ?? roleMatch?.[1] ?? null;

    const lc = content.toLowerCase();
    const riskClass =
      /stripe|payment|billing|checkout|subscription/.test(lc) ? "HIGH" :
      /auth|jwt|session|clerk|oauth|login|password/.test(lc) && /database|prisma|sql|supabase/.test(lc) ? "MEDIUM" :
      "LOW";

    const toolNames = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "Agent", "MCP"];
    const tools = toolNames.filter((t) => new RegExp(`\\b${t}\\b`).test(content));

    const constraints = content.split("\n")
      .filter((l) => /\b(never|do not|must not|always|prohibited|forbidden)\b/i.test(l))
      .map((l) => l.replace(/^[-*#>\s]+/, "").trim())
      .filter((l) => l.length > 10 && l.length < 120)
      .slice(0, 6);

    const nonDelegation = content.split("\n")
      .filter((l) => /\b(do not delegate|never delegate|human approval|require confirmation|escalate)\b/i.test(l))
      .map((l) => l.replace(/^[-*#>\s]+/, "").trim())
      .filter((l) => l.length > 5)
      .slice(0, 4);

    return { role, riskClass, tools, constraints, nonDelegation };
  }, [agent.content]);

  if (!govInfo) return <div style={{ padding: 20, color: "var(--text-dimmer)", fontSize: 11 }}>No agent selected.</div>;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <GovSection label="Role">
          <div style={{ fontSize: 12, color: govInfo.role ? "var(--text)" : "var(--text-dimmer)", fontStyle: govInfo.role ? "normal" : "italic" }}>
            {govInfo.role ?? "No role definition found"}
          </div>
        </GovSection>

        <GovSection label="Risk Class">
          <span style={{
            display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
            padding: "2px 8px", borderRadius: 2,
            color: govInfo.riskClass === "HIGH" ? "var(--red)" : govInfo.riskClass === "MEDIUM" ? "var(--yellow)" : "var(--accent)",
            background: govInfo.riskClass === "HIGH" ? "var(--red-bg)" : govInfo.riskClass === "MEDIUM" ? "rgba(210,153,34,0.1)" : "var(--accent-bg)",
            border: `1px solid ${govInfo.riskClass === "HIGH" ? "rgba(248,81,73,0.25)" : govInfo.riskClass === "MEDIUM" ? "rgba(210,153,34,0.25)" : "rgba(63,185,80,0.25)"}`,
          }}>
            {govInfo.riskClass}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-dimmer)", marginLeft: 8 }}>
            {govInfo.riskClass === "HIGH" ? "payments or billing detected" : govInfo.riskClass === "MEDIUM" ? "auth + database detected" : "no high-risk patterns"}
          </span>
        </GovSection>

        <GovSection label="Tools Referenced">
          {govInfo.tools.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-dimmer)", fontStyle: "italic" }}>None detected</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {govInfo.tools.map((t) => (
                <span key={t} style={{
                  fontSize: 10, padding: "2px 7px", background: "var(--bg-4)", color: "var(--text-dim)",
                  border: "1px solid var(--border-dim)", borderRadius: 2, fontFamily: "var(--font)",
                }}>{t}</span>
              ))}
            </div>
          )}
        </GovSection>

        <GovSection label="Hard Constraints">
          {govInfo.constraints.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-dimmer)", fontStyle: "italic" }}>None found</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {govInfo.constraints.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}>
                  <span style={{ color: "var(--red)", flexShrink: 0 }}>✕</span>
                  <span style={{ color: "var(--text-dim)", lineHeight: "1.4" }}>{c}</span>
                </div>
              ))}
            </div>
          )}
        </GovSection>

        {govInfo.nonDelegation.length > 0 && (
          <GovSection label="Non-Delegation Zones">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {govInfo.nonDelegation.map((n, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}>
                  <span style={{ color: "var(--yellow)", flexShrink: 0 }}>⚠</span>
                  <span style={{ color: "var(--text-dim)", lineHeight: "1.4" }}>{n}</span>
                </div>
              ))}
            </div>
          </GovSection>
        )}
      </div>
    </div>
  );
}

function GovSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 9, color: "var(--text-dimmer)", textTransform: "uppercase",
        letterSpacing: "0.1em", marginBottom: 6, fontFamily: "var(--font)",
      }}>{label}</div>
      {children}
    </div>
  );
}
