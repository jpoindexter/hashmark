import { useState, useEffect, useRef } from "react";
import { fetchApi } from "../../lib/api";

export interface AgentSuggestion {
  id: string;
  name: string;
  description: string;
  score: number;
  reason: string;
}

export function useAgentSuggestion(query: string, currentFile?: string) {
  const [suggestion, setSuggestion] = useState<AgentSuggestion | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = query.trim();
    if (!trimmed || trimmed.startsWith("/")) {
      setSuggestion(null);
      return;
    }
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed });
      if (currentFile) params.set("file", currentFile);
      fetchApi(`/api/agents/route?${params}`)
        .then(r => { if (!r.ok) return; return r.json(); })
        .then((d: { suggestions?: AgentSuggestion[] } | undefined) => {
          if (!d) return;
          const top = d.suggestions?.[0];
          setSuggestion(top && top.score > 0.3 ? top : null);
        })
        .catch(() => setSuggestion(null));
    }, 500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, currentFile]);

  return suggestion;
}

export function AgentChip({
  suggestion, onApply, onDismiss,
}: {
  suggestion: AgentSuggestion;
  onApply: (id: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 8px 3px 6px",
      background: "var(--bg-2)",
      border: "1px solid var(--border-dim)",
      borderRadius: 4,
      fontSize: 10,
      fontFamily: "var(--font-ui)",
      color: "var(--text-dimmer)",
      marginBottom: 6,
      width: "fit-content",
      userSelect: "none",
    }}>
      <span style={{ color: "var(--accent)", fontSize: 11, lineHeight: 1 }}>⚡</span>
      <span>Try:</span>
      <button
        onClick={() => onApply(suggestion.id)}
        title={suggestion.description || suggestion.reason}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          color: "var(--accent)", fontFamily: "inherit", fontSize: 10, fontWeight: 600,
        }}
      >
        {suggestion.name}
      </button>
      <span>for this task</span>
      <button
        onClick={onDismiss}
        style={{
          background: "none", border: "none", padding: "0 0 0 2px", cursor: "pointer",
          color: "var(--text-dimmer)", fontFamily: "inherit", fontSize: 11, lineHeight: 1,
        }}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
