import type { Session } from "../types";

const STARTER_PROMPTS = [
  "Explain the architecture of this codebase",
  "Find and fix any bugs you can see",
  "Add TypeScript types to any untyped code",
  "Write tests for the core business logic",
];

const KEYBOARD_HINTS = [
  { key: "⌘.", label: "System prompt" },
  { key: "⌘F", label: "Search" },
  { key: "/", label: "Commands" },
  { key: "⌘K", label: "Palette" },
];

export function ChatEmptyState({ session, onSelectPrompt }: {
  session: Session;
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, padding: 32 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", marginBottom: 4 }}>
          {session.title === "New Session" ? "Start a conversation" : session.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {session.system_prompt ? "Custom system prompt active" : "Ask anything about this project"}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 500 }}>
        {STARTER_PROMPTS.map(prompt => (
          <button
            key={prompt}
            onClick={() => onSelectPrompt(prompt)}
            style={{
              padding: "6px 12px", fontSize: 11, cursor: "pointer",
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", color: "var(--text-dim)",
              transition: "background var(--transition), color var(--transition), border-color var(--transition)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--accent-dim)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            {prompt}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
        {KEYBOARD_HINTS.map(({ key, label }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <kbd style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 5px" }}>{key}</kbd>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
