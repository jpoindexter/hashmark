import { useState, useEffect, Suspense, lazy, useRef, useCallback } from "react";
import { Plus, ChevronDown, SplitSquareHorizontal, Trash2, MoreHorizontal, Maximize2, Search, X, Edit2, XCircle } from "lucide-react";
import type { TerminalHandle } from "./Terminal.tsx";
import ContextMenu, { type ContextMenuItem } from "./shared/ContextMenu.tsx";
import ConfirmDialog from "./shared/ConfirmDialog.tsx";

const Terminal = lazy(() => import("./Terminal.tsx"));

interface TerminalTab {
  id: string;
  label: string;
  shell: string;
  splitId: string | null; // second pane ID when split
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
            : "var(--hover-bg-strong)"
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
    { id: genId(), label: "zsh", shell: "zsh", splitId: null },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  // Which pane is focused within the active tab: "main" or "split"
  const [activePaneSlot, setActivePaneSlot] = useState<"main" | "split">("main");
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const shellMenuRef = useRef<HTMLDivElement>(null);
  const [tabCwds, setTabCwds] = useState<Record<string, string>>({});
  const [shellIntegrationActive, setShellIntegrationActive] = useState<Record<string, boolean>>({});
  const [infoPopupTabId, setInfoPopupTabId] = useState<string | null>(null);
  const infoPopupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fontSize, setFontSize] = useState(12);

  // One ref per pane id (both main and split panes)
  const termRefs = useRef<Record<string, TerminalHandle | null>>({});

  const activeTab = tabs.find(t => t.id === activeTabId);

  // The currently focused pane ID
  const activePaneId = activePaneSlot === "split" && activeTab?.splitId
    ? activeTab.splitId
    : activeTabId;

  // Bubble active pane's CWD to parent
  useEffect(() => {
    onCwdChange?.(tabCwds[activePaneId] ?? "");
  }, [tabCwds, activePaneId, onCwdChange]);

  const addTab = useCallback((shell = "zsh") => {
    if (tabs.length >= 8) return;
    const id = genId();
    setTabs(prev => [...prev, { id, label: shell, shell, splitId: null }]);
    setActiveTabId(id);
    setActivePaneSlot("main");
    setShellMenuOpen(false);
  }, [tabs.length]);

  const closeTab = useCallback((id: string) => {
    if (tabs.length === 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const tab = tabs[idx];
    const next = tabs[idx - 1] ?? tabs[idx + 1];
    setTabs(prev => prev.filter(t => t.id !== id));
    delete termRefs.current[id];
    if (tab?.splitId) delete termRefs.current[tab.splitId];
    if (activeTabId === id) {
      setActiveTabId(next.id);
      setActivePaneSlot("main");
    }
  }, [tabs, activeTabId]);

  const killActive = useCallback(() => {
    if (tabs.length === 1) {
      const id = genId();
      delete termRefs.current[tabs[0].id];
      if (tabs[0].splitId) delete termRefs.current[tabs[0].splitId];
      setTabs([{ id, label: "zsh", shell: "zsh", splitId: null }]);
      setActiveTabId(id);
      setActivePaneSlot("main");
    } else {
      closeTab(activeTabId);
    }
  }, [tabs, activeTabId, closeTab]);

  const clearActive = useCallback(() => {
    termRefs.current[activePaneId]?.clear();
  }, [activePaneId]);

  const splitActive = useCallback(() => {
    if (!activeTab || activeTab.splitId) return; // already split
    const splitId = genId();
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, splitId } : t
    ));
    setActivePaneSlot("split");
  }, [activeTab, activeTabId]);

  const unsplitActive = useCallback(() => {
    if (!activeTab?.splitId) return;
    const splitId = activeTab.splitId;
    delete termRefs.current[splitId];
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, splitId: null } : t
    ));
    setActivePaneSlot("main");
  }, [activeTab, activeTabId]);

  const findInTerminal = useCallback(() => {
    termRefs.current[activePaneId]?.openSearch();
  }, [activePaneId]);

  // Tab context menu state
  const [tabCtxMenu, setTabCtxMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ tabId: string; currentLabel: string } | null>(null);

  const renameTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    setRenameDialog({ tabId, currentLabel: tab.label });
  }, [tabs]);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveTabId(tabId);
    setActivePaneSlot("main");
    setTabCtxMenu({ x: e.clientX, y: e.clientY, tabId });
  }, []);

  const tabCtxMenuItems: ContextMenuItem[] = tabCtxMenu ? [
    {
      label: "Rename Tab",
      icon: <Edit2 size={12} />,
      onClick: () => renameTab(tabCtxMenu.tabId),
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Split Terminal",
      icon: <SplitSquareHorizontal size={12} />,
      onClick: () => {
        setActiveTabId(tabCtxMenu.tabId);
        splitActive();
      },
    },
    {
      label: "Clear Terminal",
      icon: <Trash2 size={12} />,
      onClick: () => {
        setActiveTabId(tabCtxMenu.tabId);
        termRefs.current[tabCtxMenu.tabId]?.clear();
      },
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Kill Terminal",
      icon: <XCircle size={12} />,
      danger: true,
      onClick: () => {
        setActiveTabId(tabCtxMenu.tabId);
        killActive();
      },
    },
    {
      label: "Close Tab",
      icon: <X size={12} />,
      danger: true,
      onClick: () => closeTab(tabCtxMenu.tabId),
    },
  ] : [];

  const decreaseFontSize = () => setFontSize(s => Math.max(FONT_MIN, s - 1));
  const increaseFontSize = () => setFontSize(s => Math.min(FONT_MAX, s + 1));

  // Electron menu / command palette events
  useEffect(() => {
    const onNew = () => addTab();
    const onKill = () => killActive();
    const onClear = () => clearActive();
    const onSplit = () => splitActive();
    const onPaste = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text) termRefs.current[activePaneId]?.paste(text);
    };
    window.addEventListener("studio:new-terminal", onNew);
    window.addEventListener("studio:kill-terminal", onKill);
    window.addEventListener("studio:kill-all-terminals", onKill);
    window.addEventListener("studio:clear-terminal", onClear);
    window.addEventListener("studio:split-terminal", onSplit);
    window.addEventListener("studio:terminal-paste", onPaste);
    return () => {
      window.removeEventListener("studio:new-terminal", onNew);
      window.removeEventListener("studio:kill-terminal", onKill);
      window.removeEventListener("studio:kill-all-terminals", onKill);
      window.removeEventListener("studio:clear-terminal", onClear);
      window.removeEventListener("studio:split-terminal", onSplit);
      window.removeEventListener("studio:terminal-paste", onPaste);
    };
  }, [addTab, killActive, clearActive, splitActive, activePaneId]);

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
        <div role="tablist" aria-label="Terminal tabs" style={{ display: "flex", alignItems: "stretch", flex: 1, overflow: "hidden", height: "100%" }}>
          {tabs.map(tab => (
            <TabItem
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              onSelect={() => { setActiveTabId(tab.id); setActivePaneSlot("main"); }}
              onClose={() => closeTab(tab.id)}
              onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
              showClose={tabs.length > 1}
              isSplit={!!tab.splitId}
              showInfoPopup={infoPopupTabId === tab.id}
              onInfoEnter={() => {
                if (infoPopupTimer.current) clearTimeout(infoPopupTimer.current);
                infoPopupTimer.current = setTimeout(() => setInfoPopupTabId(tab.id), 400);
              }}
              onInfoLeave={() => {
                if (infoPopupTimer.current) clearTimeout(infoPopupTimer.current);
                infoPopupTimer.current = setTimeout(() => setInfoPopupTabId(null), 200);
              }}
              cwd={tabCwds[tab.id]}
              shellIntegration={!!shellIntegrationActive[tab.id]}
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

          {/* Find */}
          <ToolbarBtn title="Find in Terminal" onClick={findInTerminal}>
            <Search size={12} />
          </ToolbarBtn>

          {/* Clear */}
          <ToolbarBtn title="Clear Terminal" onClick={clearActive}>
            <span style={{ fontSize: 10, fontFamily: "var(--font-ui)", fontWeight: 600, letterSpacing: "-0.02em" }}>CLR</span>
          </ToolbarBtn>

          {/* New terminal + shell picker */}
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <ToolbarBtn onClick={() => addTab()} title="New Terminal">
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
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--active-bg)"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                  >
                    <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>$</span>
                    {shell}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Split / Unsplit */}
          <ToolbarBtn
            title={activeTab?.splitId ? "Unsplit Terminal" : "Split Terminal"}
            onClick={activeTab?.splitId ? unsplitActive : splitActive}
          >
            {activeTab?.splitId
              ? <X size={12} />
              : <SplitSquareHorizontal size={13} />
            }
          </ToolbarBtn>

          {/* Kill */}
          <ToolbarBtn title="Kill Terminal" onClick={killActive} danger>
            <Trash2 size={13} />
          </ToolbarBtn>

          {/* More actions */}
          <div style={{ position: "relative" }}>
            <ToolbarBtn title="More Actions" onClick={() => setMoreMenuOpen(v => !v)}>
              <MoreHorizontal size={13} />
            </ToolbarBtn>
            {moreMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "4px 0",
                  minWidth: 160,
                  zIndex: 1000,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}
              >
                <MoreMenuItem
                  label="Find in Terminal"
                  shortcut="Cmd+F"
                  onClick={() => { setMoreMenuOpen(false); findInTerminal(); }}
                />
                <MoreMenuItem
                  label="Clear Terminal"
                  onClick={() => { setMoreMenuOpen(false); clearActive(); }}
                />
                <div style={{ height: 1, background: "var(--border-dim)", margin: "3px 0" }} />
                <MoreMenuItem
                  label="New Terminal"
                  onClick={() => { setMoreMenuOpen(false); addTab(); }}
                />
                <MoreMenuItem
                  label={activeTab?.splitId ? "Unsplit Terminal" : "Split Terminal"}
                  onClick={() => { setMoreMenuOpen(false); activeTab?.splitId ? unsplitActive() : splitActive(); }}
                />
                <div style={{ height: 1, background: "var(--border-dim)", margin: "3px 0" }} />
                <MoreMenuItem
                  label="Kill Terminal"
                  danger
                  onClick={() => { setMoreMenuOpen(false); killActive(); }}
                />
              </div>
            )}
          </div>

          <ToolbarBtn title="Maximize Panel">
            <Maximize2 size={12} />
          </ToolbarBtn>
        </div>
      </div>

      {/* Terminal instances -- all tabs mounted, only active visible */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            style={{
              position: "absolute",
              inset: 0,
              display: activeTabId === tab.id ? "flex" : "none",
              flexDirection: "row",
              overflow: "hidden",
            }}
          >
            {/* Main pane */}
            <div
              onClick={() => setActivePaneSlot("main")}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderRight: tab.splitId ? "1px solid var(--border-dim)" : "none",
                outline: tab.splitId && activePaneSlot === "main"
                  ? "1px solid var(--accent)"
                  : "none",
                outlineOffset: -1,
              }}
            >
              <Suspense fallback={null}>
                <Terminal
                  ref={(handle) => { termRefs.current[tab.id] = handle; }}
                  tabId={tab.id}
                  fontSize={fontSize}
                  onCwdChange={(cwd) => setTabCwds(prev => ({ ...prev, [tab.id]: cwd }))}
                  onShellIntegration={() => setShellIntegrationActive(prev => ({ ...prev, [tab.id]: true }))}
                />
              </Suspense>
            </div>

            {/* Split pane */}
            {tab.splitId && (
              <div
                onClick={() => setActivePaneSlot("split")}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  outline: activePaneSlot === "split"
                    ? "1px solid var(--accent)"
                    : "none",
                  outlineOffset: -1,
                }}
              >
                <Suspense fallback={null}>
                  <Terminal
                    ref={(handle) => { termRefs.current[tab.splitId!] = handle; }}
                    tabId={tab.splitId}
                    fontSize={fontSize}
                    onCwdChange={(cwd) => setTabCwds(prev => ({ ...prev, [tab.splitId!]: cwd }))}
                    onShellIntegration={() => setShellIntegrationActive(prev => ({ ...prev, [tab.splitId!]: true }))}
                  />
                </Suspense>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Close menus on outside click */}
      {(shellMenuOpen || moreMenuOpen) && (
        <div
          onClick={() => { setShellMenuOpen(false); setMoreMenuOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 999 }}
        />
      )}

      <ContextMenu
        items={tabCtxMenuItems}
        position={tabCtxMenu}
        onClose={() => setTabCtxMenu(null)}
      />

      <ConfirmDialog
        open={!!renameDialog}
        title="Rename Terminal Tab"
        confirmLabel="Rename"
        onConfirm={() => {}}
        onCancel={() => setRenameDialog(null)}
        inputMode
        inputPlaceholder="Tab name"
        inputDefaultValue={renameDialog?.currentLabel ?? ""}
        onConfirmWithValue={(value) => {
          if (renameDialog && value.trim()) {
            setTabs(prev => prev.map(t =>
              t.id === renameDialog.tabId ? { ...t, label: value.trim() } : t
            ));
          }
          setRenameDialog(null);
        }}
      />
    </div>
  );
}

function MoreMenuItem({
  label,
  shortcut,
  onClick,
  danger,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "5px 12px",
        fontSize: 12,
        fontFamily: "var(--font-ui)",
        color: danger ? "var(--red)" : "var(--text)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--active-bg)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
    >
      <span>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}

function TabItem({
  tab,
  active,
  onSelect,
  onClose,
  onContextMenu,
  showClose,
  isSplit,
  showInfoPopup,
  onInfoEnter,
  onInfoLeave,
  cwd,
  shellIntegration,
}: {
  tab: TerminalTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  showClose: boolean;
  isSplit: boolean;
  showInfoPopup: boolean;
  onInfoEnter: () => void;
  onInfoLeave: () => void;
  cwd?: string;
  shellIntegration: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const tabRef = useRef<HTMLDivElement>(null);

  // Shortened CWD for display: show last 2 segments
  const shortCwd = cwd
    ? cwd.split("/").filter(Boolean).slice(-2).join("/")
    : null;

  return (
    <div
      ref={tabRef}
      role="tab"
      tabIndex={0}
      aria-selected={active}
      aria-label={`Terminal: ${tab.label}`}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      onContextMenu={onContextMenu}
      onMouseEnter={() => { setHovered(true); onInfoEnter(); }}
      onMouseLeave={() => { setHovered(false); onInfoLeave(); }}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "0 8px 0 10px",
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "var(--font)",
        color: active ? "var(--text)" : "var(--text-dimmer)",
        borderRight: "1px solid var(--border-dim)",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        background: active ? "var(--bg-3)" : hovered ? "var(--surface-subtle)" : "transparent",
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
        {tab.shell === "node" ? "\u2B21" : tab.shell === "python" ? "\u2B22" : "$"}
      </span>
      <span style={{ flex: 1 }}>{tab.label}</span>
      {isSplit && (
        <SplitSquareHorizontal
          size={10}
          style={{ color: "var(--text-dimmer)", flexShrink: 0 }}
        />
      )}
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
            (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-strong)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)";
          }}
        >
          {"\u00d7"}
        </button>
      )}

      {/* Info popup */}
      {showInfoPopup && (
        <div
          onMouseEnter={onInfoEnter}
          onMouseLeave={onInfoLeave}
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            minWidth: 200,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 10px",
            zIndex: 1100,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            fontSize: 11,
            fontFamily: "var(--font-ui)",
            color: "var(--text)",
            display: "flex",
            flexDirection: "column",
            gap: 5,
            animation: "dropdownIn 0.12s ease-out",
          }}
        >
          <InfoRow label="Shell" value={tab.shell} />
          <InfoRow label="Tab" value={tab.label} />
          {shortCwd && <InfoRow label="CWD" value={shortCwd} title={cwd} />}
          <InfoRow
            label="Shell integration"
            value={shellIntegration ? "active" : "inactive"}
            accent={shellIntegration}
          />
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  title,
  accent,
}: {
  label: string;
  value: string;
  title?: string;
  accent?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--text-dimmer)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, flexShrink: 0 }}>
        {label}
      </span>
      <span
        title={title}
        style={{
          color: accent ? "var(--accent)" : "var(--text-dim)",
          fontFamily: "var(--font)",
          fontSize: 11,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 160,
        }}
      >
        {value}
      </span>
    </div>
  );
}
