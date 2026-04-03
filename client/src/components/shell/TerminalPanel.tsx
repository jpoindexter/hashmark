import { useState, useCallback, useMemo } from "react";
import { Copy, ClipboardPaste, Trash2, Plus, XCircle } from "lucide-react";
import TerminalTabs from "../TerminalTabs";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";

interface TerminalPanelProps {
  termBig: boolean;
  onToggleBig: () => void;
  onClose: () => void;
  onCwdChange: (cwd: string) => void;
}

export default function TerminalPanel({
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

  const [panelTab, setPanelTab] = useState<"terminal" | "output">("terminal");
  const PANEL_TABS = [
    { id: "terminal" as const, label: "Terminal" },
    { id: "output" as const, label: "Output" },
  ];

  return (
    <div style={{
      flex: termBig ? 1 : undefined,
      height: termBig ? "100%" : undefined,
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
      overflow: "hidden",
    }}>
      {/* Conductor-style panel tab strip */}
      <div style={{
        display: "flex", alignItems: "stretch", height: 32,
        borderBottom: "1px solid var(--border-dim)", flexShrink: 0,
      }}>
        {PANEL_TABS.map(tab => (
          <button key={tab.id} className="hoverable" onClick={() => setPanelTab(tab.id)} style={{
            padding: "0 12px", fontSize: 12, color: panelTab === tab.id ? "var(--text)" : "var(--text-dimmer)",
            borderBottom: panelTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
            background: "none", border: "none", cursor: "pointer",
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div
        onContextMenu={handleTerminalContextMenu}
        style={{ flex: 1, overflow: "hidden", display: panelTab === "terminal" ? "flex" : "none", flexDirection: "column" }}
      >
        <TerminalTabs onCwdChange={onCwdChange} onClose={onClose} onToggleBig={onToggleBig} termBig={termBig} />
      </div>
      {panelTab === "output" && (
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
