const DISPATCH_SUGGESTIONS = [
  "scan this project for design violations",
  "review recent changes and summarize what changed",
  "run a full audit -- violations, hierarchy, contrast",
  "fix all spacing token mismatches",
];

export function EmptyState({ modelLabel: _modelLabel }: { modelLabel: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "0 40px", overflow: "auto" }}>
      <div style={{ fontFamily: "var(--font)", fontSize: 14, color: "var(--text-dimmer)", letterSpacing: "0.02em" }}>
        what do you want to build?
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%", maxWidth: 440 }}>
        {DISPATCH_SUGGESTIONS.map(text => (
          <button key={text} className="hoverable"
            onClick={() => window.dispatchEvent(new CustomEvent("studio:suggest", { detail: { text } }))}
            style={{ fontSize: 12.5, color: "var(--text-dimmer)", padding: "9px 14px", border: "0.5px solid var(--border-dim)", borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all 0.12s", background: "transparent", fontFamily: "var(--font-ui)", textAlign: "left" }}>
            <span style={{ color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 11, flexShrink: 0 }}>{"->"}</span>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ResumedDivider({ timestamp }: { timestamp: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", userSelect: "none" }}>
      <div style={{ flex: 1, height: 1, background: "var(--border-dim)" }} />
      <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
        Resumed session {"\u00b7"} {new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border-dim)" }} />
    </div>
  );
}
