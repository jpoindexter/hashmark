import { useState } from "react";

export function MultiSelectOptions({ options, onSubmit }: { options: string[]; onSubmit: (val: string) => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handleSubmit = () => {
    const joined = options.filter((_, i) => selected.has(i)).join(", ");
    if (joined) onSubmit(joined);
  };

  return (
    <div>
      {options.map((opt, i) => (
        <div
          key={i}
          onClick={() => toggle(i)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", marginBottom: 4, fontSize: 12,
            background: selected.has(i) ? "var(--bg-active)" : "var(--bg)",
            border: `1px solid ${selected.has(i) ? "var(--border-focus)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)", cursor: "pointer", color: selected.has(i) ? "var(--text)" : "var(--text-dim)",
            transition: "background var(--transition), color var(--transition), border-color var(--transition)",
            userSelect: "none",
          }}
          onMouseEnter={e => { if (!selected.has(i)) { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; } }}
          onMouseLeave={e => { if (!selected.has(i)) { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.color = "var(--text-dim)"; } }}
        >
          <div style={{
            width: 14, height: 14, border: `1px solid ${selected.has(i) ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 3, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: selected.has(i) ? "var(--accent)" : "transparent", transition: "all 100ms",
          }}>
            {selected.has(i) && <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="var(--text-on-accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          {opt}
        </div>
      ))}
      <button
        onClick={handleSubmit}
        disabled={selected.size === 0}
        style={{
          marginTop: 6, padding: "6px 14px", fontSize: 12,
          background: selected.size > 0 ? "var(--accent)" : "var(--bg-active)",
          color: selected.size > 0 ? "var(--text-on-accent)" : "var(--text-muted)",
          border: "none", borderRadius: "var(--radius-sm)",
          cursor: selected.size > 0 ? "pointer" : "default",
          fontWeight: 600, transition: "background 100ms",
        }}
      >
        Submit ({selected.size} selected)
      </button>
    </div>
  );
}

export function AskFreeText({ onSubmit }: { onSubmit: (val: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && val.trim()) { onSubmit(val.trim()); } }}
        autoFocus
        style={{
          flex: 1, padding: "6px 10px", fontSize: 12, background: "var(--bg)",
          border: "1px solid var(--border-focus)", borderRadius: "var(--radius-sm)",
          color: "var(--text)", outline: "none",
        }}
        placeholder="Type your answer..."
      />
      <button
        onClick={() => { if (val.trim()) onSubmit(val.trim()); }}
        style={{ padding: "6px 12px", fontSize: 12, background: "var(--accent)", color: "var(--text-on-accent)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600 }}
      >
        Send
      </button>
    </div>
  );
}
