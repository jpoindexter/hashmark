import { useState, useEffect } from "react";
import { ChevronUp, ChevronDown, Zap, AlertTriangle } from "lucide-react";
import { fetchApi } from "../lib/api";

type LoopStatus = "clean" | "watch" | "loop";

interface LoopFinding {
  pattern: string;
  severity: "warning" | "critical";
  label: string;
  description: string;
  snippet?: string;
}

interface LoopAnalysis {
  status: LoopStatus;
  findings: LoopFinding[];
  messageCount: number;
}

interface StageBreakdown {
  early: number;
  middle: number;
  recent: number;
}

interface TokenInfo {
  inputTokens: number;
  outputTokens: number;
  userInputTokens: number;
  assistantOutputTokens: number;
  userCount: number;
  assistantCount: number;
  total: number;
  contextWindow: number;
  pct: number;
  messageCount: number;
  wasteEstimatePct: number;
  stageBreakdown?: StageBreakdown;
  avgMessageTokens?: number;
}

interface ContextBarProps {
  sessionId: string | null;
  streaming: boolean;
}

function fmt(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function ContextBar({ sessionId, streaming }: ContextBarProps) {
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loopAnalysis, setLoopAnalysis] = useState<LoopAnalysis | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!sessionId || streaming) return;
    fetchApi(`/api/sessions/${sessionId}/tokens`)
      .then(r => r.json())
      .then((d: TokenInfo) => setInfo(d))
      .catch(() => {});
    fetchApi(`/api/sessions/${sessionId}/loop-analysis`)
      .then(r => r.json())
      .then((d: LoopAnalysis) => setLoopAnalysis(d))
      .catch(() => {});
  }, [sessionId, streaming]);

  // Reset expanded when session changes
  useEffect(() => { setExpanded(false); setLoopAnalysis(null); }, [sessionId]);

  if (!info || !sessionId || info.total === 0) return null;

  const { pct, wasteEstimatePct } = info;
  const barColor = pct > 80 ? "var(--red)" : pct > 60 ? "var(--yellow)" : "var(--accent)";
  const wasteColor = wasteEstimatePct > 25 ? "var(--red)" : wasteEstimatePct > 15 ? "var(--yellow)" : "var(--text-dimmer)";

  // Three-part token breakdown: your messages | history overhead | responses
  const historyOverhead = Math.max(0, info.inputTokens - info.userInputTokens);
  const yourMsgPct = info.total > 0 ? Math.round((info.userInputTokens / info.total) * 100) : 0;
  const historyPct = info.total > 0 ? Math.round((historyOverhead / info.total) * 100) : 0;
  const responsesPct = info.total > 0 ? Math.round((info.outputTokens / info.total) * 100) : 0;
  // History overhead is a waste signal — warn when it dominates input
  const historyDominates = historyOverhead > 0 && info.inputTokens > 0 && (historyOverhead / info.inputTokens) > 0.7;

  return (
    <div style={{ borderTop: "1px solid var(--border-dim)", flexShrink: 0 }}>
      {/* Progress bar */}
      <div style={{ height: 2, background: "var(--border-dim)", position: "relative" }}>
        <div style={{
          position: "absolute", top: 0, left: 0,
          height: "100%",
          width: `${pct}%`,
          background: barColor,
          transition: "width 0.3s ease, background 0.3s ease",
        }} />
      </div>

      {/* Collapsed summary row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "3px 10px",
          fontSize: 12,
          fontFamily: "var(--font)",
          color: "var(--text-dimmer)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: barColor }}>{pct}%</span>
          <span>of context used</span>
          {wasteEstimatePct > 10 && (
            <span style={{ color: wasteColor, display: "flex", alignItems: "center", gap: 2 }}>
              <Zap size={9} />
              ~{wasteEstimatePct}% est. waste
            </span>
          )}
          {loopAnalysis && loopAnalysis.status !== "clean" && (
            <span style={{
              color: loopAnalysis.status === "loop" ? "var(--red)" : "var(--yellow)",
              display: "flex", alignItems: "center", gap: 2,
            }}>
              <AlertTriangle size={9} />
              {loopAnalysis.status === "loop" ? "loop detected" : "watch"}
            </span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{info.messageCount} msgs</span>
          {expanded
            ? <ChevronDown size={10} />
            : <ChevronUp size={10} />}
        </span>
      </div>

      {/* Expanded breakdown */}
      {expanded && (
        <div style={{
          borderTop: "1px solid var(--border-dim)",
          padding: "8px 12px",
          fontSize: 11,
          fontFamily: "var(--font)",
          color: "var(--text-dim)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>

          {/* Token totals */}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-dimmer)" }}>Total tokens</span>
            <span style={{ color: "var(--text)" }}>
              {fmt(info.total)} / {fmt(info.contextWindow)}
            </span>
          </div>

          {/* Three-part token flow */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: "var(--text-dimmer)" }}>Token flow</span>
              {historyDominates && (
                <span style={{ color: "var(--yellow)", fontSize: 10 }}>history-heavy</span>
              )}
            </div>
            {/* Stacked bar */}
            <div style={{ height: 4, background: "var(--border-dim)", display: "flex", overflow: "hidden" }}>
              <div style={{ width: `${yourMsgPct}%`, background: "var(--accent)", transition: "width 0.3s", flexShrink: 0, cursor: "pointer" }} title={`Your messages: ${fmt(info.userInputTokens)} tokens (${yourMsgPct}%)`} />
              <div style={{ width: `${historyPct}%`, background: "var(--yellow)", opacity: 0.7, transition: "width 0.3s", flexShrink: 0, cursor: "pointer" }} title={`History overhead: ${fmt(historyOverhead)} tokens (${historyPct}%)`} />
              <div style={{ flex: 1, background: "var(--accent)", opacity: 0.5, cursor: "pointer" }} title={`Responses: ${fmt(info.outputTokens)} tokens (${responsesPct}%)`} />
            </div>
            {/* Legend */}
            <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
              {([
                ["Your msgs", "var(--accent)", yourMsgPct, info.userInputTokens],
                ["History", "var(--yellow)", historyPct, historyOverhead],
                ["Responses", "var(--accent)", responsesPct, info.outputTokens],
              ] as [string, string, number, number][]).map(([label, color, pct, tokens]) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--text-dimmer)" }}>
                  <span style={{ width: 6, height: 6, background: color, opacity: 0.8, borderRadius: 1, flexShrink: 0 }} />
                  <span>{label}</span>
                  <span style={{ color }}>{pct}%</span>
                  <span style={{ color: "var(--text-dimmer)", opacity: 0.6 }}>({fmt(tokens)})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Conversation stages */}
          {info.stageBreakdown && (() => {
            const { early, middle, recent } = info.stageBreakdown;
            const stageTotal = early + middle + recent;
            const earlyPct = stageTotal > 0 ? Math.round((early / stageTotal) * 100) : 0;
            const midPct = stageTotal > 0 ? Math.round((middle / stageTotal) * 100) : 0;
            const recentPct = stageTotal > 0 ? 100 - earlyPct - midPct : 0;
            const recencyRatio = stageTotal > 0 ? recent / stageTotal : 0;
            const recencyLabel = recencyRatio > 0.5
              ? { text: "recent-heavy", color: "var(--accent)" }
              : recencyRatio < 0.2
              ? { text: "front-heavy", color: "var(--yellow)" }
              : null;
            return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ color: "var(--text-dimmer)" }}>Conversation stages</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {recencyLabel && (
                      <span style={{ color: recencyLabel.color, fontSize: 10 }}>{recencyLabel.text}</span>
                    )}
                    {info.avgMessageTokens !== undefined && (
                      <span style={{ color: "var(--text-dimmer)" }}>~{fmt(info.avgMessageTokens)}t avg/msg</span>
                    )}
                  </span>
                </div>
                <div style={{ height: 4, background: "var(--border-dim)", display: "flex", overflow: "hidden" }}>
                  <div style={{ width: `${earlyPct}%`, background: "var(--text-dimmer)", opacity: 0.6, flexShrink: 0, cursor: "pointer" }} title={`Early: ${fmt(early)} tokens (${earlyPct}%)`} />
                  <div style={{ width: `${midPct}%`, background: "var(--accent)", opacity: 0.6, flexShrink: 0, cursor: "pointer" }} title={`Middle: ${fmt(middle)} tokens (${midPct}%)`} />
                  <div style={{ flex: 1, background: "var(--accent)", cursor: "pointer" }} title={`Recent: ${fmt(recent)} tokens (${recentPct}%)`} />
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                  {([
                    ["Early", "var(--text-dimmer)", earlyPct, early],
                    ["Mid", "var(--accent)", midPct, middle],
                    ["Recent", "var(--accent)", recentPct, recent],
                  ] as [string, string, number, number][]).map(([label, color, p, tokens]) => (
                    <span key={label} style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--text-dimmer)" }}>
                      <span style={{ width: 6, height: 6, background: color, opacity: 0.8, borderRadius: 1, flexShrink: 0 }} />
                      <span>{label}</span>
                      <span style={{ color }}>{fmt(tokens)}</span>
                      <span style={{ color: "var(--text-dimmer)", opacity: 0.6 }}>({p}%)</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Structural waste estimate */}
          <div style={{
            background: "var(--bg-3)",
            border: `1px solid ${wasteEstimatePct > 15 ? "rgba(248,81,73,0.2)" : "var(--border-dim)"}`,
            padding: "6px 8px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: wasteColor, display: "flex", alignItems: "center", gap: 4 }}>
                <Zap size={9} />
                Structural waste estimate
              </span>
              <span style={{ color: wasteColor, fontWeight: 600 }}>~{wasteEstimatePct}%</span>
            </div>
            <div style={{ color: "var(--text-dimmer)", lineHeight: "1.4" }}>
              Dead tool outputs, re-sent schemas, and static content accumulate as sessions grow.
              {wasteEstimatePct > 20 && (
                <span style={{ color: "var(--yellow)" }}> Consider compacting this mission.</span>
              )}
            </div>
            {/* Waste breakdown mini-bars */}
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
              {([
                ["Dead tool output", 26.5],
                ["Unused schemas", 20.2],
                ["Static re-sends", 11.0],
              ] as [string, number][]).map(([label, pctShare]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 80, color: "var(--text-dimmer)" }}>{label}</div>
                  <div style={{ flex: 1, height: 2, background: "var(--border-dim)", cursor: "pointer" }} title={`${label}: ${pctShare}% of structural waste`}>
                    <div style={{
                      width: `${pctShare}%`, height: "100%",
                      background: "var(--red)", opacity: 0.6,
                    }} />
                  </div>
                  <div style={{ width: 30, textAlign: "right", color: "var(--text-dimmer)" }}>
                    {pctShare}%
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: "var(--text-dimmer)", fontStyle: "italic" }}>
              Typical distribution per Pichay (2603.09023), 857 sessions
            </div>
          </div>

          {/* Loop analysis */}
          {loopAnalysis && loopAnalysis.findings.length > 0 && (
            <div style={{
              background: "var(--bg-3)",
              border: `1px solid ${loopAnalysis.status === "loop" ? "rgba(248,81,73,0.3)" : "rgba(226,197,65,0.3)"}`,
              padding: "6px 8px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{
                  color: loopAnalysis.status === "loop" ? "var(--red)" : "var(--yellow)",
                  display: "flex", alignItems: "center", gap: 4,
                  fontWeight: 600,
                }}>
                  <AlertTriangle size={9} />
                  {loopAnalysis.status === "loop" ? "Loop Detected" : "Loop Watch"}
                </span>
                <span style={{ color: "var(--text-dimmer)" }}>{loopAnalysis.findings.length} pattern{loopAnalysis.findings.length !== 1 ? "s" : ""}</span>
              </div>
              {loopAnalysis.findings.map(f => (
                <div key={f.pattern} style={{ marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 4px",
                      background: f.severity === "critical" ? "rgba(248,81,73,0.15)" : "rgba(226,197,65,0.15)",
                      color: f.severity === "critical" ? "var(--red)" : "var(--yellow)",
                    }}>
                      {f.label.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ color: "var(--text-dimmer)", lineHeight: 1.4 }}>{f.description}</div>
                  {f.snippet && (
                    <div style={{
                      marginTop: 3, fontFamily: "var(--font)", fontSize: 10,
                      color: "var(--text-dimmer)", background: "var(--bg-2)",
                      padding: "2px 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {f.snippet}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Message counts */}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-dimmer)" }}>You / AI</span>
            <span>
              <span style={{ color: "var(--text)" }}>{info.userCount}</span>
              <span style={{ color: "var(--text-dimmer)" }}> / </span>
              <span style={{ color: "var(--accent)" }}>{info.assistantCount}</span>
              <span style={{ color: "var(--text-dimmer)" }}> messages</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
