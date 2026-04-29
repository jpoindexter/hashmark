const SHORTCUTS = [
  { group: "Sessions" },
  { label: "Command palette", key: "⌘K" },
  { label: "New session", key: "⌘N" },
  { label: "Close session", key: "⌘W" },
  { label: "Previous session", key: "⌘[" },
  { label: "Next session", key: "⌘]" },
  { group: "Chat" },
  { label: "Send message", key: "⌘↵" },
  { label: "Search messages", key: "⌘F" },
  { label: "Slash commands", key: "/" },
  { label: "@ mention file", key: "@" },
  { label: "Cancel agent / toggle system prompt", key: "⌘." },
  { group: "View" },
  { label: "Side chat panel", key: "⌘;" },
  { label: "Cycle tool view mode", key: "status bar ≡" },
  { label: "Preview pane", key: "status bar ⬜" },
  { label: "Split view (click 2nd tab)", key: "tab click" },
  { group: "Navigation" },
  { label: "Command palette", key: "⌘K" },
  { label: "This shortcuts panel", key: "⌘/ or ?" },
  { label: "Close overlay / palette", key: "Esc" },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--overlay-bg)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px", width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Keyboard Shortcuts</div>
        {SHORTCUTS.map((item, i) => (
          "group" in item ? (
            <div key={`g${i}`} style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", padding: "10px 0 4px", marginTop: i > 0 ? 4 : 0 }}>{item.group}</div>
          ) : (
            <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{item.label}</span>
              <kbd style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>{item.key}</kbd>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
