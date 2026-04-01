interface ShortcutSection {
  title: string;
  rows: [string, string][];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: "NAVIGATION",
    rows: [
      ["g s", "Chat"],
      ["g f", "Files"],
      ["g a", "Agents"],
      ["g g", "Git"],
      ["g r", "Run"],
      ["g c", "Company"],
    ],
  },
  {
    title: "UI TOGGLES",
    rows: [
      ["\u2318B", "Toggle sidebar"],
      ["\u2318`", "Toggle terminal"],
      ["\u2318J", "Toggle terminal"],
    ],
  },
  {
    title: "FOCUS",
    rows: [
      ["\u2318L", "Focus chat input"],
      ["\u2318K", "Command palette"],
      ["\u2318\u21E7P", "Command palette"],
    ],
  },
  {
    title: "VIEWS",
    rows: [
      ["\u2318\u21E7E", "Explorer"],
      ["\u2318\u21E7G", "Source Control"],
      ["\u2318\u21E7F", "Search"],
      ["\u2318\u21E7A", "Agents"],
      ["\u2318,", "Settings"],
    ],
  },
  {
    title: "OTHER",
    rows: [
      ["?", "This help"],
    ],
  },
];

import { useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

const cellKey: React.CSSProperties = {
  padding: "3px 16px 3px 0",
  color: "var(--accent)",
  whiteSpace: "nowrap",
};
const cellLabel: React.CSSProperties = {
  padding: "3px 0",
  color: "var(--text-dim)",
};
const sectionHeader: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.08em",
  color: "var(--text-dimmer)",
  marginBottom: 8,
};

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "var(--overlay-bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "20px 28px",
          minWidth: 280,
          maxWidth: 360,
          fontFamily: "var(--font)",
          fontSize: 12,
          color: "var(--text-dim)",
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dimmer)", marginBottom: 16 }}>
          KEYBOARD SHORTCUTS
        </div>

        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div style={sectionHeader}>{section.title}</div>
            <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 16 }}>
              <tbody>
                {section.rows.map(([keys, label]) => (
                  <tr key={keys}>
                    <td style={cellKey}>{keys}</td>
                    <td style={cellLabel}>{label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
          Press <span style={{ color: "var(--accent)" }}>Esc</span> or <span style={{ color: "var(--accent)" }}>?</span> to close
        </div>
      </div>
    </div>
  );
}
