import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { useModels } from "../../hooks/useModels";

export function ModelPickerDropdown({ selectedModel, thinking, planMode }: {
  selectedModel: string;
  thinking: boolean;
  planMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { grouped, models } = useModels();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = models.find(m => m.id === selectedModel);
  const currentLabel = selectedModel === "auto" ? "Auto" : (current?.label ?? selectedModel.split("/").pop() ?? selectedModel);

  function selectModel(modelId: string) {
    window.dispatchEvent(new CustomEvent("studio:settings-change", { detail: { key: "selectedModel", value: modelId } }));
    setOpen(false);
  }

  function toggleThinking() {
    window.dispatchEvent(new CustomEvent("studio:toggle-thinking"));
  }

  function togglePlan() {
    window.dispatchEvent(new CustomEvent("studio:toggle-plan"));
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
      <button
        className="hoverable"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "3px 8px", background: "none", border: "none",
          color: "var(--text-dim)", fontSize: 11,
          fontFamily: "var(--font-ui)", cursor: "pointer",
          borderRadius: "var(--radius)",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600 }}>{current?.provider ? `${current.provider}` : ""}</span>
        <span>{currentLabel}</span>
        <ChevronDown size={10} style={{ opacity: 0.5 }} />
      </button>

      <button
        className="hoverable"
        onClick={toggleThinking}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "3px 8px", background: thinking ? "var(--accent-bg)" : "none",
          border: thinking ? "1px solid var(--accent-border)" : "1px solid transparent",
          color: thinking ? "var(--accent)" : "var(--text-dimmer)", fontSize: 11,
          fontFamily: "var(--font-ui)", cursor: "pointer",
          borderRadius: "var(--radius)", transition: "all 0.1s",
        }}
      >
        Thinking
      </button>

      <button
        className="hoverable"
        onClick={togglePlan}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "3px 8px", background: planMode ? "var(--cyan-bg)" : "none",
          border: planMode ? "1px solid rgba(6,182,212,0.25)" : "1px solid transparent",
          color: planMode ? "var(--cyan)" : "var(--text-dimmer)", fontSize: 11,
          fontFamily: "var(--font-ui)", cursor: "pointer",
          borderRadius: "var(--radius)", transition: "all 0.1s",
        }}
      >
        Plan
      </button>

      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: 0,
          background: "var(--bg-3)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
          minWidth: 240, maxWidth: 320, maxHeight: 400,
          overflow: "auto", zIndex: 500,
          animation: "dropdownIn 0.12s ease-out",
        }}>
          <div
            className="hoverable"
            onClick={() => selectModel("auto")}
            style={{
              padding: "7px 12px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: "1px solid var(--border-dim)",
            }}
          >
            <span style={{ fontSize: 12, color: selectedModel === "auto" ? "var(--accent)" : "var(--text-dim)", fontWeight: selectedModel === "auto" ? 600 : 400 }}>
              Auto (smart routing)
            </span>
            {selectedModel === "auto" && <span style={{ fontSize: 9, color: "var(--accent)" }}>active</span>}
          </div>

          {grouped.map(g => (
            <div key={g.provider.id}>
              <div className="label" style={{ padding: "8px 12px 4px" }}>
                {g.provider.name}
              </div>
              {g.models.map(m => {
                const isActive = m.id === selectedModel;
                return (
                  <div
                    key={m.id}
                    className="hoverable"
                    onClick={() => selectModel(m.id)}
                    style={{
                      padding: "5px 12px 5px 20px", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    }}
                  >
                    <span style={{
                      fontSize: 12, color: isActive ? "var(--accent)" : "var(--text-dim)",
                      fontWeight: isActive ? 600 : 400,
                    }}>
                      {m.label}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
                      {isActive ? "active" : (m.note ?? "")}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
