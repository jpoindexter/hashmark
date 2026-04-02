import { useState, useMemo, useEffect } from "react";
import { fetchApi } from "../../lib/api";
import type { Agent, SkillCheck, CheckStatus, EffectivenessData } from "./types";

interface AgentEditorProps {
  agent: Agent;
  editContent: string;
  onEditContent: (content: string) => void;
}

export default function AgentEditor({ agent, editContent, onEditContent }: AgentEditorProps) {
  const [showAllChecks, setShowAllChecks] = useState(false);
  const [effectiveness, setEffectiveness] = useState<EffectivenessData | null>(null);

  useEffect(() => {
    setEffectiveness(null);
    fetchApi(`/api/agents/${agent.id}/effectiveness`)
      .then(r => r.json())
      .then(d => setEffectiveness(d as EffectivenessData))
      .catch(() => {});
  }, [agent.id]);

  const skillChecks = useMemo((): SkillCheck[] => {
    const text = editContent;
    const len = text.length;
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
    const fm = fmMatch ? fmMatch[1] : "";
    const hasName = /^name\s*:/m.test(fm);
    const hasDesc = /^description\s*:/m.test(fm);
    const descLine = fm.match(/^description\s*:\s*(.+)/m)?.[1]?.trim() ?? "";
    const body = fmMatch ? text.slice(fmMatch[0].length).trim() : text.trim();
    const checks: SkillCheck[] = [];

    checks.push({
      id: "has-name", label: "HAS NAME",
      status: hasName ? "pass" : "error",
      detail: hasName ? "name: present" : "Missing name: in frontmatter",
    });
    checks.push({
      id: "has-desc", label: "HAS DESCRIPTION",
      status: hasDesc ? "pass" : "error",
      detail: hasDesc ? "description: present" : "Missing description: in frontmatter",
    });
    const descVague = /^agent for\s/i.test(descLine);
    const descShort = descLine.length > 0 && descLine.length < 20;
    const descStatus: CheckStatus = !hasDesc ? "error" : (descShort || descVague) ? "warn" : "pass";
    checks.push({
      id: "desc-specific", label: "DESCRIPTION QUALITY",
      status: descStatus,
      detail: !hasDesc ? "No description" : descVague ? "Too generic — avoid 'Agent for X'" : descShort ? `Only ${descLine.length} chars — be more specific` : "Looks specific",
    });
    const bodyLen = body.length;
    checks.push({
      id: "has-instructions", label: "HAS INSTRUCTIONS",
      status: bodyLen >= 100 ? "pass" : "warn",
      detail: bodyLen >= 100 ? `${bodyLen} chars of instructions` : `Body too short (${bodyLen} chars) — add concrete instructions or examples`,
    });
    const secretMatch = text.match(/sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|AKIA[A-Z0-9]{10,}|api[_-]?key\s*[:=]\s*['"]?\S{8,}/i);
    checks.push({
      id: "no-secrets", label: "NO SECRETS",
      status: secretMatch ? "error" : "pass",
      detail: secretMatch ? `Potential secret detected: ${secretMatch[0].slice(0, 12)}…` : "No credential patterns found",
    });
    const broadMatch = text.match(/\bdo anything\b|\ball tools\b|\bno restrictions\b/i);
    checks.push({
      id: "no-broad-perms", label: "SCOPED PERMISSIONS",
      status: broadMatch ? "warn" : "pass",
      detail: broadMatch ? `Broad permission phrase: "${broadMatch[0]}"` : "No overly broad permission phrases",
    });
    const lenStatus: CheckStatus = len < 200 ? "warn" : len > 8000 ? "warn" : "pass";
    checks.push({
      id: "reasonable-length", label: "REASONABLE LENGTH",
      status: lenStatus,
      detail: len < 200 ? `${len} chars — too vague, add more detail` : len > 8000 ? `${len} chars — very long, may hurt injection efficiency` : `${len} chars — good`,
    });
    const anythingCount = (text.match(/\banything\b/gi) ?? []).length;
    checks.push({
      id: "clear-scope", label: "CLEAR SCOPE",
      status: anythingCount > 2 ? "warn" : "pass",
      detail: anythingCount > 2 ? `"anything" used ${anythingCount}x — scope is too vague` : "Scope looks defined",
    });
    return checks;
  }, [editContent]);

  const passingCount = skillChecks.filter((c) => c.status === "pass").length;
  const hasErrors = skillChecks.some((c) => c.status === "error");
  const hasWarnings = skillChecks.some((c) => c.status === "warn");
  const overallStatus = hasErrors ? "INVALID" : hasWarnings ? "NEEDS WORK" : "GOOD";
  const overallColor = hasErrors ? "var(--red)" : hasWarnings ? "var(--yellow)" : "var(--accent)";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <textarea
        value={editContent}
        onChange={(e) => onEditContent(e.target.value)}
        style={{
          flex: 1, resize: "none", border: "none", borderRadius: 0,
          background: "var(--bg)", padding: "16px 20px", fontSize: "12px",
          lineHeight: "1.6", color: "var(--text)", fontFamily: "var(--font)",
        }}
      />
      {editContent && (
        <SkillChecksPanel
          checks={skillChecks}
          passingCount={passingCount}
          overallStatus={overallStatus}
          overallColor={overallColor}
          showAll={showAllChecks}
          onToggleShowAll={() => setShowAllChecks((v) => !v)}
        />
      )}
      {effectiveness && <EffectivenessPanel data={effectiveness} />}
    </div>
  );
}

function SkillChecksPanel({ checks, passingCount, overallStatus, overallColor, showAll, onToggleShowAll }: {
  checks: SkillCheck[];
  passingCount: number;
  overallStatus: string;
  overallColor: string;
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const hasErrors = checks.some((c) => c.status === "error");
  const hasWarnings = checks.some((c) => c.status === "warn");
  return (
    <div style={{ borderTop: "1px solid var(--border-dim)", background: "var(--bg-2)", flexShrink: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 14px", borderBottom: "1px solid var(--border-dim)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="text-micro" style={{
            fontFamily: "var(--font)", padding: "2px 6px", borderRadius: 2, color: overallColor,
            background: hasErrors ? "rgba(248,81,73,0.1)" : hasWarnings ? "rgba(210,153,34,0.1)" : "rgba(63,185,80,0.1)",
            border: `1px solid ${hasErrors ? "rgba(248,81,73,0.25)" : hasWarnings ? "rgba(210,153,34,0.25)" : "rgba(63,185,80,0.25)"}`,
          }}>
            {overallStatus}
          </span>
          <span style={{ fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)" }}>
            {passingCount}/{checks.length} checks
          </span>
        </div>
        <button onClick={onToggleShowAll} className="text-micro" style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font)", padding: 0,
        }}>
          {showAll ? "hide passing" : "show all"}
        </button>
      </div>
      <div style={{ padding: "6px 0", maxHeight: 160, overflowY: "auto" }}>
        {checks
          .filter((c) => showAll || c.status !== "pass")
          .map((c) => (
            <div key={c.id} style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 14px",
              fontSize: 10, fontFamily: "var(--font)",
            }}>
              <span style={{
                flexShrink: 0, marginTop: 1,
                color: c.status === "pass" ? "var(--accent)" : c.status === "warn" ? "var(--yellow)" : "var(--red)",
              }}>
                {c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : "✗"}
              </span>
              <span className="text-micro" style={{
                flexShrink: 0, marginTop: 1,
                color: c.status === "pass" ? "var(--text-dimmer)" : c.status === "warn" ? "var(--yellow)" : "var(--red)",
              }}>
                {c.label}
              </span>
              <span style={{ color: "var(--text-dimmer)", fontSize: 10, lineHeight: "1.4" }}>{c.detail}</span>
            </div>
          ))}
        {!showAll && checks.every((c) => c.status === "pass") && (
          <div style={{ padding: "4px 14px", fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)", fontStyle: "italic" }}>
            All checks passing
          </div>
        )}
      </div>
    </div>
  );
}

function EffectivenessPanel({ data }: { data: EffectivenessData }) {
  return (
    <div style={{ borderTop: "1px solid var(--border-dim)", background: "var(--bg-2)", flexShrink: 0, padding: "8px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span className="text-micro" style={{ fontFamily: "var(--font)" }}>
          Effectiveness
        </span>
        {data.totalRuns === 0 ? (
          <span style={{ fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)", fontStyle: "italic" }}>No runs yet</span>
        ) : (
          <span style={{ fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)" }}>
            {data.totalRuns} run{data.totalRuns !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {data.totalRuns > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span className="text-micro" style={{ fontFamily: "var(--font)" }}>
                Success Rate
              </span>
              <span style={{ fontSize: 9, fontFamily: "var(--font)", color: "var(--accent)" }}>
                {Math.round(data.successRate * 100)}%
              </span>
            </div>
            <div style={{ height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${Math.round(data.successRate * 100)}%`,
                background: "var(--accent)", borderRadius: 2, transition: "width 0.3s ease",
              }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="text-micro" style={{ fontFamily: "var(--font)" }}>
              Trend
            </span>
            {data.recentTrend === "insufficient_data" ? (
              <span style={{ fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)" }}>—</span>
            ) : (
              <span style={{
                fontSize: 10, fontFamily: "var(--font)", fontWeight: 600,
                color: data.recentTrend === "improving" ? "var(--accent)" : data.recentTrend === "degrading" ? "var(--red)" : "var(--yellow)",
              }}>
                {data.recentTrend === "improving" ? "↑" : data.recentTrend === "degrading" ? "↓" : "→"}{" "}
                {data.recentTrend}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
