export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["g s", "Sessions"],
    ["g r", "Run"],
    ["g c", "Company"],
    ["g a", "Agents"],
    ["g g", "Git"],
    ["g f", "Files"],
  ];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "20px 28px",
          minWidth: 280,
          fontFamily: "var(--font)",
          fontSize: 12,
          color: "var(--text-dim)",
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dimmer)", marginBottom: 16 }}>
          KEYBOARD SHORTCUTS
        </div>

        <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--text-dimmer)", marginBottom: 8 }}>
          NAVIGATION
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 16 }}>
          <tbody>
            {rows.map(([keys, label]) => (
              <tr key={keys}>
                <td style={{ padding: "3px 16px 3px 0", color: "var(--accent)", whiteSpace: "nowrap" }}>{keys}</td>
                <td style={{ padding: "3px 0", color: "var(--text-dim)" }}>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--text-dimmer)", marginBottom: 8 }}>
          ACTIONS
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 20 }}>
          <tbody>
            <tr>
              <td style={{ padding: "3px 16px 3px 0", color: "var(--accent)", whiteSpace: "nowrap" }}>⌘K</td>
              <td style={{ padding: "3px 0", color: "var(--text-dim)" }}>Command palette</td>
            </tr>
            <tr>
              <td style={{ padding: "3px 16px 3px 0", color: "var(--accent)", whiteSpace: "nowrap" }}>?</td>
              <td style={{ padding: "3px 0", color: "var(--text-dim)" }}>This help</td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
          Press <span style={{ color: "var(--accent)" }}>Esc</span> or <span style={{ color: "var(--accent)" }}>?</span> to close
        </div>
      </div>
    </div>
  );
}
