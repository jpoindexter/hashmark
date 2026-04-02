import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface AgentDef {
  id: string;
  name: string;
  description: string;
}

interface AgentPickerProps {
  agents: AgentDef[];
  selectedId: string;
  onSelect: (id: string) => void;
  grouped: Map<string, AgentDef[]>;
  deptColor: (id: string) => string;
}

function deptFromId(id: string): string {
  const seg = id.split("-")[0].toLowerCase();
  return seg;
}

export default function AgentPicker({
  agents,
  selectedId,
  onSelect,
  grouped,
  deptColor,
}: AgentPickerProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = agents.find((a) => a.id === selectedId);
  const label = selected ? selected.name : "No specific agent";
  const selectedDept = selectedId ? deptFromId(selectedId) : null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open && filterRef.current) {
      filterRef.current.focus();
    }
  }, [open]);

  // Build filtered flat list for keyboard nav
  const filterLower = filter.toLowerCase();
  const filteredGroups = Array.from(grouped.entries())
    .map(([dept, deptAgents]) => {
      const matches = filterLower
        ? deptAgents.filter(
            (a) =>
              a.name.toLowerCase().includes(filterLower) ||
              dept.toLowerCase().includes(filterLower),
          )
        : deptAgents;
      return [dept, matches] as [string, AgentDef[]];
    })
    .filter(([, items]) => items.length > 0);

  // Flat list: "none" option + all filtered agents
  const flatItems: Array<{ id: string; name: string; dept?: string }> = [
    { id: "", name: "No specific agent" },
    ...filteredGroups.flatMap(([dept, items]) =>
      items.map((a) => ({ id: a.id, name: a.name, dept })),
    ),
  ];

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => {
          const next = Math.min(i + 1, flatItems.length - 1);
          scrollToIdx(next);
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => {
          const next = Math.max(i - 1, 0);
          scrollToIdx(next);
          return next;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[highlightIdx];
        if (item) {
          onSelect(item.id);
          setOpen(false);
          setFilter("");
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setFilter("");
      }
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, highlightIdx, flatItems, onSelect]);

  // Scroll highlighted item into view
  function scrollToIdx(idx: number) {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll("[data-picker-row]");
    const el = rows[idx] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [filter]);

  let flatIdx = 0;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          background: "var(--bg-3)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          color: selectedId ? "var(--text)" : "var(--text-dimmer)",
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          cursor: "pointer",
          minWidth: 180,
          outline: "none",
          transition: "border-color 0.12s ease",
        }}
      >
        {selectedId ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: deptColor(selectedId),
                flexShrink: 0,
              }}
            />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {label}
            </span>
            {selectedDept && (
              <span className="text-micro" style={{
                color: deptColor(selectedId),
                border: `1px solid ${deptColor(selectedId)}`,
                padding: "0px 4px",
                borderRadius: "var(--radius)",
                flexShrink: 0,
                opacity: 0.7,
                lineHeight: "16px",
              }}>
                {selectedDept}
              </span>
            )}
          </span>
        ) : (
          <span style={{ flex: 1, textAlign: "left" }}>No specific agent</span>
        )}
        <ChevronDown
          size={12}
          style={{
            flexShrink: 0,
            opacity: 0.5,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={listRef}
          className="dropdown-animate"
          role="listbox"
          aria-label="Select agent"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 100,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            minWidth: 280,
            maxHeight: 360,
            overflowY: "auto",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {/* Search input */}
          <div style={{ padding: "8px 8px 4px", borderBottom: "1px solid var(--border-dim)", position: "sticky", top: 0, background: "var(--bg-3)", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "var(--bg-2)", borderRadius: "var(--radius)", border: "1px solid var(--border-dim)" }}>
              <Search size={12} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />
              <input
                ref={filterRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter agents..."
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  color: "var(--text)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  padding: 0,
                }}
              />
              {filter && (
                <span
                  style={{ fontSize: 9, color: "var(--text-dimmer)", flexShrink: 0 }}
                >
                  {flatItems.length - 1} result{flatItems.length - 1 !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* "No specific agent" option */}
          <PickerRow
            label="No specific agent"
            isSelected={selectedId === ""}
            isHighlighted={highlightIdx === 0}
            onSelect={() => { onSelect(""); setOpen(false); setFilter(""); }}
            onMouseEnter={() => setHighlightIdx(0)}
          />

          {/* Grouped agents */}
          {filteredGroups.map(([dept, items], gi) => (
            <div key={dept}>
              {gi > 0 && (
                <div style={{ borderTop: "1px solid var(--border-dim)" }} />
              )}
              <div className="label" style={{
                padding: "6px 12px 3px",
                userSelect: "none",
              }}>
                {dept}
              </div>
              {items.map((a) => {
                // +1 because index 0 is the "No specific agent" row
                const idx = ++flatIdx;
                return (
                  <PickerRow
                    key={a.id}
                    label={a.name}
                    dept={dept}
                    dotColor={deptColor(a.id)}
                    isSelected={a.id === selectedId}
                    isHighlighted={idx === highlightIdx}
                    onSelect={() => { onSelect(a.id); setOpen(false); setFilter(""); }}
                    onMouseEnter={() => setHighlightIdx(idx)}
                  />
                );
              })}
            </div>
          ))}

          {flatItems.length === 1 && filter && (
            <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-dimmer)", textAlign: "center" }}>
              No agents match "{filter}"
            </div>
          )}

          {/* Footer hint */}
          <div
            style={{
              padding: "4px 12px 6px",
              fontSize: 10,
              color: "var(--text-dimmer)",
              borderTop: "1px solid var(--border-dim)",
              display: "flex",
              gap: 10,
              fontFamily: "var(--font-ui)",
            }}
          >
            <span>up/down navigate</span>
            <span>enter select</span>
            <span>esc close</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Single row in the picker dropdown
function PickerRow({
  label,
  dept,
  dotColor,
  isSelected,
  isHighlighted,
  onSelect,
  onMouseEnter,
}: {
  label: string;
  dept?: string;
  dotColor?: string;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      data-picker-row
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "7px 12px",
        background: isHighlighted ? "var(--surface-dim)" : "none",
        border: "none",
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        color: isSelected ? "var(--accent)" : "var(--text-dim)",
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.1s ease",
      }}
    >
      {dotColor && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      )}
      <span style={{ flex: 1 }}>{label}</span>
      {dept && dotColor && (
        <span className="text-micro" style={{
          color: dotColor,
          border: `1px solid ${dotColor}`,
          padding: "0px 4px",
          borderRadius: "var(--radius)",
          opacity: 0.5,
          lineHeight: "16px",
          flexShrink: 0,
        }}>
          {dept}
        </span>
      )}
      {isSelected && <Check size={12} style={{ flexShrink: 0 }} />}
    </button>
  );
}
