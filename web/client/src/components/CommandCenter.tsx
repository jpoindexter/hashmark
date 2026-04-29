import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CCResult {
  id: string;
  group: "Sessions" | "Agents" | "Issues" | "Snippets" | "KB Pages" | "Actions";
  icon: string;
  title: string;
  subtitle?: string;
  action: () => void;
}

interface Session { id: string; title: string; model: string; status: string; }
interface Agent  { id: string; name: string; system_prompt?: string; }
interface Issue  { id: string; title: string; status?: string; }
interface Snippet { id: string; title: string; body: string; }
interface KBPage  { id: string; title: string; content: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function lsRead<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T[];
  } catch { /* ignore */ }
  return [];
}

function dispatch(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined));
}

const GROUP_ORDER: CCResult["group"][] = ["Actions", "Sessions", "Agents", "Issues", "Snippets", "KB Pages"];

const ACTIONS: Array<Omit<CCResult, "id">> = [
  { group: "Actions", icon: "+", title: "New Session",    action: () => dispatch("hm-new-session") },
  { group: "Actions", icon: "⬡", title: "New Agent",     action: () => dispatch("hm-nav", "agents") },
  { group: "Actions", icon: "!", title: "New Issue",      action: () => dispatch("hm-nav", "issues") },
  { group: "Actions", icon: "⚙", title: "Open Settings", action: () => dispatch("hm-nav", "settings") },
  { group: "Actions", icon: "▦", title: "Open Stats",    action: () => dispatch("hm-nav", "stats") },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export function CommandCenter({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CCResult[]>([]);
  const [cursor, setCursor] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch API data once on mount
  useEffect(() => {
    void fetchApi<Session[]>("/api/sessions").then(setSessions).catch(() => {});
    void fetchApi<Agent[]>("/api/agents").then(setAgents).catch(() => {});
  }, []);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buildResults = useCallback((q: string): CCResult[] => {
    const lq = q.toLowerCase();
    const all: CCResult[] = [];

    // Actions
    ACTIONS
      .filter(a => !lq || a.title.toLowerCase().includes(lq))
      .forEach((a, i) => all.push({ ...a, id: `action-${i}` }));

    // Sessions
    sessions
      .filter(s => !lq || s.title.toLowerCase().includes(lq))
      .slice(0, 8)
      .forEach(s => all.push({
        id: `session-${s.id}`,
        group: "Sessions",
        icon: s.status === "running" ? "●" : "○",
        title: s.title,
        subtitle: `${s.model} · ${s.status}`,
        action: () => dispatch("hm-open-session", s.id),
      }));

    // Agents
    agents
      .filter(a => !lq || a.name.toLowerCase().includes(lq))
      .slice(0, 6)
      .forEach(a => all.push({
        id: `agent-${a.id}`,
        group: "Agents",
        icon: "⬡",
        title: a.name,
        subtitle: a.system_prompt?.slice(0, 60),
        action: () => dispatch("hm-nav", "agents"),
      }));

    // Issues
    lsRead<Issue>("hm-issues")
      .filter(i => !lq || i.title.toLowerCase().includes(lq))
      .slice(0, 6)
      .forEach(i => all.push({
        id: `issue-${i.id}`,
        group: "Issues",
        icon: "!",
        title: i.title,
        subtitle: i.status,
        action: () => dispatch("hm-nav", "issues"),
      }));

    // Snippets
    lsRead<Snippet>("hm-snippets")
      .filter(s => !lq || s.title.toLowerCase().includes(lq) || s.body.toLowerCase().includes(lq))
      .slice(0, 6)
      .forEach(s => all.push({
        id: `snippet-${s.id}`,
        group: "Snippets",
        icon: "≡",
        title: s.title,
        subtitle: s.body.slice(0, 60),
        action: () => dispatch("hm-nav", "snippets"),
      }));

    // KB Pages
    lsRead<KBPage>("hm-kb-pages")
      .filter(p => !lq || p.title.toLowerCase().includes(lq) || p.content.toLowerCase().includes(lq))
      .slice(0, 6)
      .forEach(p => all.push({
        id: `kb-${p.id}`,
        group: "KB Pages",
        icon: "📄",
        title: p.title || "Untitled",
        subtitle: p.content.slice(0, 60),
        action: () => dispatch("hm-nav", "kb"),
      }));

    // Sort by group order
    all.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
    return all;
  }, [sessions, agents]);

  useEffect(() => {
    const next = buildResults(query);
    setResults(next);
    setCursor(0);
  }, [query, buildResults]);

  const execute = (item: CCResult) => {
    item.action();
    onClose();
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor(v => Math.min(v + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor(v => Math.max(v - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        const item = results[cursor];
        if (item) execute(item);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        // Cycle through groups
        const currentGroup = results[cursor]?.group;
        const nextGroupIdx = results.findIndex((r, i) => i > cursor && r.group !== currentGroup);
        if (nextGroupIdx !== -1) setCursor(nextGroupIdx);
        else setCursor(0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, cursor, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // Group results for rendering
  const grouped: Array<{ group: CCResult["group"]; items: Array<CCResult & { idx: number }> }> = [];
  let flatIdx = 0;
  for (const group of GROUP_ORDER) {
    const items = results
      .map((r, i) => ({ ...r, idx: i }))
      .filter(r => r.group === group);
    if (items.length > 0) grouped.push({ group, items: items.map(r => ({ ...r, idx: flatIdx++ })) });
    // fix idx drift — re-map correctly
  }
  // Re-derive with correct flat indices
  const groupedFinal: typeof grouped = [];
  let gi = 0;
  for (const group of GROUP_ORDER) {
    const items = results
      .map((r, i) => ({ ...r, idx: i }))
      .filter(r => r.group === group);
    if (items.length > 0) groupedFinal.push({ group, items });
    gi++;
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.55)", display: "flex",
        alignItems: "flex-start", justifyContent: "center", paddingTop: "15vh",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 620, maxWidth: "90vw", background: "var(--bg-panel)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-lg, 10px)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          display: "flex", flexDirection: "column",
          maxHeight: "60vh", overflow: "hidden",
          animation: "gc-fade-in 0.12s both",
        }}
      >
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search sessions, agents, issues, pages..."
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              fontSize: 14, color: "var(--text)", fontFamily: "var(--font-sans)",
            }}
          />
          <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 6px", background: "var(--bg-elevated)", borderRadius: 3 }}>Esc</span>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto" }}>
          {groupedFinal.length === 0 && (
            <div style={{ padding: "24px 16px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
              No results
            </div>
          )}
          {groupedFinal.map(({ group, items }) => (
            <div key={group}>
              <div style={{
                padding: "8px 14px 3px", fontSize: 10, fontWeight: 600,
                color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                {group}
              </div>
              {items.map(item => {
                const isActive = item.idx === cursor;
                return (
                  <div
                    key={item.id}
                    data-idx={item.idx}
                    onClick={() => execute(item)}
                    onMouseEnter={() => setCursor(item.idx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 14px", cursor: "pointer",
                      background: isActive ? "var(--bg-elevated)" : "transparent",
                      borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-muted)", width: 16, textAlign: "center", flexShrink: 0 }}>
                      {item.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    {isActive && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "1px 6px", background: "var(--bg)", borderRadius: 3, flexShrink: 0 }}>↵</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hints */}
        <div style={{
          padding: "6px 14px", borderTop: "1px solid var(--border)", flexShrink: 0,
          display: "flex", gap: 12, fontSize: 10, color: "var(--text-muted)",
        }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Tab next group</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
