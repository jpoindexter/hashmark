import { useState, useCallback, useMemo } from "react";
import { Copy, ClipboardPaste, Trash2, Plus, XCircle } from "lucide-react";
import TerminalTabs from "../TerminalTabs";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";

const PANEL_TABS = ["TERMINAL", "OUTPUT"] as const;
type PanelTab = (typeof PANEL_TABS)[number];

interface TerminalPanelProps {
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  termBig: boolean;
  onToggleBig: () => void;
  onClose: () => void;
  onCwdChange: (cwd: string) => void;
}

export default function TerminalPanel({
  activeTab,
  onTabChange,
  termBig,
  onToggleBig,
  onClose,
  onCwdChange,
}: TerminalPanelProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleTerminalContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const dispatch = useCallback((eventName: string) => {
    window.dispatchEvent(new CustomEvent(eventName));
  }, []);

  const ctxMenuItems = useMemo((): ContextMenuItem[] => [
    {
      label: "Copy",
      icon: <Copy size={12} />,
      onClick: () => {
        const selection = document.getSelection();
        if (selection && selection.toString()) {
          navigator.clipboard.writeText(selection.toString()).catch(() => {});
        }
      },
    },
    {
      label: "Paste",
      icon: <ClipboardPaste size={12} />,
      onClick: async () => {
        try {
          const text = await navigator.clipboard.readText();
          window.dispatchEvent(new CustomEvent("studio:terminal-paste", { detail: text }));
        } catch {
          // Clipboard API may fail without focus/permission
        }
      },
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Clear Terminal",
      icon: <Trash2 size={12} />,
      onClick: () => dispatch("studio:clear-terminal"),
    },
    {
      label: "New Terminal",
      icon: <Plus size={12} />,
      onClick: () => dispatch("studio:new-terminal"),
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Kill Terminal",
      icon: <XCircle size={12} />,
      danger: true,
      onClick: () => dispatch("studio:kill-terminal"),
    },
  ], [dispatch]);

  return (
    <div style={{
      flex: termBig ? 1 : undefined,
      height: termBig ? "100%" : undefined,
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
      overflow: "hidden",
    }}>
      {/* Tab bar */}
      <div style={{
        height: 30,
        background: "var(--bg-3)",
        borderBottom: "1px solid var(--border-dim)",
        display: "flex",
        alignItems: "stretch",
        flexShrink: 0,
      }}>
        {PANEL_TABS.map(tab => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none"; }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0 14px",
                fontSize: 11,
                fontFamily: "var(--font)",
                color: isActive ? "var(--text)" : "var(--text-dimmer)",
                borderBottom: isActive ? "1px solid var(--accent)" : "1px solid transparent",
                letterSpacing: "0.05em",
                transition: "color 0.1s, background 0.1s",
              }}
            >
              {tab}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          title={termBig ? "Restore terminal" : "Maximize terminal"}
          onClick={onToggleBig}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg-strong)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-dimmer)",
            fontSize: 13,
            padding: "0 10px",
            transition: "background 0.1s",
          }}
        >
          {termBig ? "\u2291" : "\u229E"}
        </button>
        <button
          title="Close terminal (\u2318`)"
          onClick={onClose}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg-strong)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-dimmer)",
            fontSize: 14,
            padding: "0 10px",
            transition: "background 0.1s",
          }}
        >
          x
        </button>
      </div>

      {/* Terminal content */}
      <div
        onContextMenu={handleTerminalContextMenu}
        style={{ flex: 1, overflow: "hidden", display: activeTab === "TERMINAL" ? "flex" : "none", flexDirection: "column" }}
      >
        <TerminalTabs onCwdChange={onCwdChange} />
      </div>
      {activeTab === "OUTPUT" && (
        <div style={{ flex: 1, padding: "12px 16px", overflow: "auto", fontSize: 12, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
          No output yet.
        </div>
      )}

      <ContextMenu
        items={ctxMenuItems}
        position={ctxMenu}
        onClose={closeCtxMenu}
      />
    </div>
  );
}
