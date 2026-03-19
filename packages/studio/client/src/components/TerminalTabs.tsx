import { useState, useEffect, Suspense, lazy, useRef } from "react";
import { Plus, ChevronDown, SplitSquareHorizontal, Trash2, MoreHorizontal, Maximize2 } from "lucide-react";
import type { TerminalHandle } from "./Terminal.tsx";

const Terminal = lazy(() => import("./Terminal.tsx"));

interface TerminalTab {
  id: string;
  label: string;
  shell: string;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

const SHELLS = ["zsh", "bash", "node", "python"];
const FONT_MIN = 12;
const FONT_MAX = 16;

function ToolbarBtn({
  onClick,
  title,
  children,
  danger,
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: 4,
        border: "none",
        background: hovered
          ? danger
            ? "rgba(248, 81, 73, 0.15)"
            : "rgba(255,255,255,0.08)"
          : "none",
        color: hovered
          ? danger ? "var(--red)" : "var(--text)"
          : "var(--text-dimmer)",
        cursor: "pointer",
        padding: 0,
        transition: "background 0.1s, color 0.1s",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export default function TerminalTabs({ onCwdChange }: { onCwdChange?: (cwd: string) => void }) {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: genId(), label: "zsh", shell: "zsh" },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const shellMenuRef = useRef<HTMLDivElement>(null);
  const [tabCwds, setTabCwds] = useState<Record<string, string>>({});
  const [fontSize, setFontSize] = useState(12);

  // One ref per tab id — keyed map of refs
  const termRefs = useRef<Record<string, TerminalHandle | null>>({});

  // Bubble active tab's CWD to parent whenever it changes or active tab switches
  useEffect(() => {
    onCwdChange?.(tabCwds[activeTabId] ?? "");
  }, [tabCwds, activeTabId, onCwdChange]);

  const addTab = (shell = "zsh") => {
    if (tabs.length >= 8) return;
    const id = genId();
    setTabs(prev => [...prev, { id, label: shell, shell }]);
    setActiveTabId(id);
    setShellMenuOpen(false);
  };

  const closeTab = (id: string) => {
    if (tabs.length === 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const next = tabs[idx - 1] ?? tabs[idx + 1];
    setTabs(prev => prev.filter(t => t.id !== id));
    // Clean up ref
    delete termRefs.current[id];
    if (activeTabId === id) setActiveTabId(next.id);
  };

  const killActive = () => {
    if (tabs.length === 1) {
      const id = genId();
      setTabs([{ id, label: "zsh", shell: "zsh" }]);
      setActiveTabId(id);
    } else {
      closeTab(activeTabId);
    }
  };

  const clearActive = () => {
    termRefs.current[activeTabId]?.clear();
  };

  const decreaseFontSize = () => setFontSize(s => Math.max(FONT_MIN, s - 1));
  const increaseFontSize = () => setFontSize(s => Math.min(FONT_MAX, s + 1));

  // Electron menu / command palette events
  useEffect(() => {
    const onNew = () => addTab();
    const onKill = () => killActive();
    const onClear = () => clearActive();
    window.addEventListener("studio:new-terminal", onNew);
    window.addEventListener("studio:kill-terminal", onKill);
    window.addEventListener("studio:kill-all-terminals", onKill);
    window.addEventListener("studio:clear-terminal", onClear);
    return () => {
      window.removeEventListener("studio:new-terminal", onNew);
      window.removeEventListener("studio:kill-terminal", onKill);
      window.removeEventListener("studio:kill-all-terminals", onKill);
      window.removeEventListener("studio:clear-terminal", onClear);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, tabs.length]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>
      {/* VSCode-style terminal toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        height: 29,
        borderBottom: "1px solid var(--border-dim)",
        background: "var(--bg-2)",
        flexShrink: 0,
        paddingRight: 6,
        gap: 1,
        overflow: "hidden",
      }}>
        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "stretch", flex: 1, overflow: "hidden", height: "100%" }}>
          {tabs.map(tab => (
            <TabItem
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              onSelect={() => setActiveTabId(tab.id)}
              onClose={() => closeTab(tab.id)}
              showClose={tabs.length > 1}
            />
          ))}
        </div>

        {/* Right toolbar actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0, paddingLeft: 4, borderLeft: "1px solid var(--border-dim)" }}>

          {/* Font size controls */}
          <button
            onClick={decreaseFontSize}
            disabled={fontSize <= FONT_MIN}
            title={`Decrease font size (${fontSize}px)`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 22,
              padding: "0 5px",
              borderRadius: 4,
              border: "none",
              background: "none",
              color: fontSize <= FONT_MIN ? "var(--text-dimmer)" : "var(--text-dim)",
              cursor: fontSize <= FONT_MIN ? "not-allowed" : "pointer",
              fontSize: 11,
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            A-
          </button>
          <button
            onClick={increaseFontSize}
            disabled={fontSize >= FONT_MAX}
            title={`Increase font size (${fontSize}px)`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 22,
              padding: "0 5px",
              borderRadius: 4,
              border: "none",
              background: "none",
              color: fontSize >= FONT_MAX ? "var(--text-dimmer)" : "var(--text-dim)",
              cursor: fontSize >= FONT_MAX ? "not-allowed" : "pointer",
              fontSize: 13,
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            A+
          </button>

          {/* Clear */}
          <ToolbarBtn title="Clear Terminal" onClick={clearActive}>
            <span style={{ fontSize: 10, fontFamily: "var(--font-ui)", fontWeight: 600, letterSpacing: "-0.02em" }}>CLR</span>
          </ToolbarBtn>

          {/* New terminal + shell picker */}
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <ToolbarBtn onClick={() => addTab()} title="New Terminal (⌃`)">
                <Plus size={13} />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => setShellMenuOpen(v => !v)} title="Launch Profile">
                <ChevronDown size={11} />
              </ToolbarBtn>
            </div>
            {shellMenuOpen && (
              <div
                ref={shellMenuRef}
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "4px 0",
                  minWidth: 140,
                  zIndex: 1000,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}
              >
                <div style={{ padding: "3px 10px 5px", fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font-ui)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Select Shell
                </div>
                {SHELLS.map(shell => (
                  <div
                    key={shell}
                    onClick={() => addTab(shell)}
                    style={{
                      padding: "5px 12px",
                      fontSize: 12,
                      fontFamily: "var(--font)",
                      color: "var(--text)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                  >
                    <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>$</span>
                    {shell}
                  </div>
                ))}
              </div>
            )}
          </div>

          <ToolbarBtn title="Split Terminal" onClick={() => addTab()}>
            <SplitSquareHorizontal size={13} />
          </ToolbarBtn>

          <ToolbarBtn title="Kill Terminal" onClick={killActive} danger>
            <Trash2 size={13} />
          </ToolbarBtn>

          <ToolbarBtn title="More Actions">
            <MoreHorizontal size={13} />
          </ToolbarBtn>

          <ToolbarBtn title="Maximize Panel">
            <Maximize2 size={12} />
          </ToolbarBtn>
        </div>
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
              <Terminal
                ref={(handle) => { termRefs.current[tab.id] = handle; }}
                tabId={tab.id}
                fontSize={fontSize}
                onCwdChange={(cwd) => setTabCwds(prev => ({ ...prev, [tab.id]: cwd }))}
              />
            </Suspense>
          </div>
        ))}
      </div>

      {/* Close shell menu on outside click */}
      {shellMenuOpen && (
        <div
          onClick={() => setShellMenuOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 999 }}
        />
      )}
    </div>
  );
}

function TabItem({
  tab,
  active,
  onSelect,
  onClose,
  showClose,
}: {
  tab: TerminalTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  showClose: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "0 8px 0 10px",
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "var(--font)",
        color: active ? "var(--text)" : "var(--text-dimmer)",
        borderRight: "1px solid var(--border-dim)",
        borderBottom: active ? "1px solid var(--accent)" : "1px solid transparent",
        background: active ? "var(--bg-3)" : hovered ? "rgba(255,255,255,0.03)" : "transparent",
        flexShrink: 0,
        userSelect: "none",
        minWidth: 80,
        height: "100%",
        transition: "background 0.1s",
      }}
    >
      {/* Shell icon */}
      <span style={{
        fontSize: 10,
        color: active ? "var(--accent)" : "var(--text-dimmer)",
        fontWeight: 600,
        fontFamily: "var(--font)",
      }}>
        {tab.shell === "node" ? "⬡" : tab.shell === "python" ? "⬢" : "$"}
      </span>
      <span style={{ flex: 1 }}>{tab.label}</span>
      {showClose && (hovered || active) && (
        <button
          onClick={e => { e.stopPropagation(); onClose(); }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            borderRadius: 3,
            border: "none",
            background: "none",
            color: "var(--text-dimmer)",
            cursor: "pointer",
            padding: 0,
            fontSize: 12,
            lineHeight: 1,
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)";
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
