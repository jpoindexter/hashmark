import { useState, Suspense, lazy } from "react";

const Terminal = lazy(() => import("./Terminal.tsx"));

interface TerminalTab {
  id: string;
  label: string;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function TerminalTabs() {
  const [tabs, setTabs] = useState<TerminalTab[]>([{ id: genId(), label: "bash 1" }]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);

  const addTab = () => {
    if (tabs.length >= 5) return;
    const id = genId();
    const num = tabs.length + 1;
    const newTab: TerminalTab = { id, label: `bash ${num}` };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
  };

  const closeTab = (id: string) => {
    if (tabs.length === 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const next = tabs[idx - 1] ?? tabs[idx + 1];
    setTabs(prev => prev.filter(t => t.id !== id));
    if (activeTabId === id) setActiveTabId(next.id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        alignItems: "stretch",
        height: 28,
        borderBottom: "1px solid var(--border-dim)",
        background: "var(--bg-2)",
        flexShrink: 0,
        overflow: "hidden",
      }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 10px",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "var(--font)",
              color: activeTabId === tab.id ? "var(--text)" : "var(--text-dimmer)",
              borderRight: "1px solid var(--border-dim)",
              borderBottom: activeTabId === tab.id ? "1px solid var(--accent)" : "1px solid transparent",
              background: activeTabId === tab.id ? "var(--bg-3)" : "transparent",
              flexShrink: 0,
              userSelect: "none",
            }}
          >
            <span>{tab.label}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  padding: "0 2px",
                  fontSize: 12,
                  lineHeight: 1,
                  opacity: 0.6,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}

        {tabs.length < 5 && (
          <button
            onClick={addTab}
            style={{
              background: "none",
              border: "none",
              borderRight: "1px solid var(--border-dim)",
              color: "var(--text-dimmer)",
              cursor: "pointer",
              padding: "0 10px",
              fontSize: 14,
              fontFamily: "var(--font)",
            }}
          >
            +
          </button>
        )}
      </div>

      {/* Terminal instances — all mounted, only active visible */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            style={{
              position: "absolute",
              inset: 0,
              display: activeTabId === tab.id ? "flex" : "none",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Suspense fallback={null}>
              <Terminal tabId={tab.id} />
            </Suspense>
          </div>
        ))}
      </div>
    </div>
  );
}
