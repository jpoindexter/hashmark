import { useState, useEffect } from "react";

interface TokenInfo {
  inputTokens: number;
  outputTokens: number;
  total: number;
  contextWindow: number;
  pct: number;
  messageCount: number;
}

interface ContextBarProps {
  sessionId: string | null;
  streaming: boolean;
}

export function ContextBar({ sessionId, streaming }: ContextBarProps) {
  const [info, setInfo] = useState<TokenInfo | null>(null);

  useEffect(() => {
    if (!sessionId || streaming) return;
    fetch(`/api/sessions/${sessionId}/tokens`)
      .then(r => r.json())
      .then((d: TokenInfo) => setInfo(d))
      .catch(() => {});
  }, [sessionId, streaming]);

  if (!info || !sessionId || info.total === 0) return null;

  const pct = info.pct;
  const barColor = pct > 80 ? "var(--red)" : pct > 60 ? "var(--yellow)" : "var(--accent)";

  return (
    <div style={{ borderTop: "1px solid var(--border-dim)", flexShrink: 0 }}>
      <div style={{ height: 2, background: "var(--border-dim)", position: "relative" }}>
        <div style={{
          position: "absolute", top: 0, left: 0,
          height: "100%",
          width: `${pct}%`,
          background: barColor,
          transition: "width 0.3s ease, background 0.3s ease",
        }} />
      </div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "3px 12px",
        fontSize: 10,
        fontFamily: "var(--font)",
        color: "var(--text-dimmer)",
      }}>
        <span>
          ~{info.total.toLocaleString()} / {info.contextWindow.toLocaleString()} tokens
          <span style={{ marginLeft: 6, color: barColor }}>{pct}%</span>
        </span>
        <span>{info.messageCount} messages</span>
      </div>
    </div>
  );
}
