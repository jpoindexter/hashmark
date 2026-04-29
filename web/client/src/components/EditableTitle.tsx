import { useState, useEffect, useRef } from "react";

export function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        style={{
          flex: 1, minWidth: 0, background: "none", border: "none",
          borderBottom: "1px solid var(--border-focus)", outline: "none",
          fontSize: 13, fontWeight: 600, color: "var(--text)",
          fontFamily: "var(--font-mono)", padding: "1px 0",
        }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to rename"
      style={{
        fontSize: 13, fontWeight: 600, color: "var(--text)",
        cursor: "text", overflow: "hidden", textOverflow: "ellipsis",
        whiteSpace: "nowrap", flex: 1, minWidth: 0,
      }}
    >
      {value}
    </span>
  );
}
