import { useState, useEffect } from "react";
import { ChevronUp, ChevronDown, Zap } from "lucide-react";

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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!sessionId || streaming) return;
    fetch(`/api/sessions/${sessionId}/tokens`)
      .then(r => r.json())
      .then((d: TokenInfo) => setInfo(d))
      .catch(() => {});
  }, [sessionId, streaming]);

  // Reset expanded when session changes
  useEffect(() => { setExpanded(false); }, [sessionId]);

  if (!info || !sessionId || info.total === 0) return null;

  const { pct, wasteEstimatePct } = info;
  const barColor = pct > 80 ? "var(--red)" : pct > 60 ? "var(--yellow)" : "var(--accent)";
  const wasteColor = wasteEstimatePct > 25 ? "var(--red)" : wasteEstimatePct > 15 ? "var(--yellow)" : "var(--text-dimmer)";

  // Input split: user prompts vs system overhead (estimated)
  const inputPct = info.total > 0 ? Math.round((info.inputTokens / info.total) * 100) : 0;
  const outputPct = 100 - inputPct;

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
          fontSize: 10,
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
          fontSize: 10,
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

          {/* Input/output split bar */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: "var(--text-dimmer)" }}>Input / Output split</span>
              <span>
                <span style={{ color: "var(--accent)" }}>{inputPct}%</span>
                {" / "}
                <span style={{ color: "var(--blue)" }}>{outputPct}%</span>
              </span>
            </div>
            <div style={{ height: 3, background: "var(--border-dim)", display: "flex" }}>
              <div style={{ width: `${inputPct}%`, background: "var(--accent)", transition: "width 0.3s" }} />
              <div style={{ flex: 1, background: "var(--blue)", opacity: 0.5 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, color: "var(--text-dimmer)" }}>
              <span>{fmt(info.inputTokens)} in</span>
              <span>{fmt(info.outputTokens)} out</span>
            </div>
          </div>

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
                <span style={{ color: "var(--yellow)" }}> Consider compacting this session.</span>
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
                  <div style={{ flex: 1, height: 2, background: "var(--border-dim)" }}>
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
            <div style={{ marginTop: 4, color: "var(--text-dimmer)", fontStyle: "italic" }}>
              Typical distribution per Pichay (2603.09023), 857 sessions
            </div>
          </div>

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
