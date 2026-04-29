import { useState, useEffect, useCallback } from "react";

export interface Notification {
  id: string;
  type: "workflow_run" | "agent_chain" | "recurring_issue" | "focus_complete" | "error" | "info";
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  link?: string;
}

const STORAGE_KEY = "hm-notifications";

function load(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Notification[];
  } catch { /* ignore */ }
  return [];
}

function save(items: Notification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function pushNotification(n: Omit<Notification, "id" | "timestamp" | "read">) {
  const items = load();
  const next: Notification = {
    ...n,
    id: Math.random().toString(36).slice(2, 10),
    timestamp: Date.now(),
    read: false,
  };
  items.unshift(next);
  save(items);
  window.dispatchEvent(new CustomEvent("hm-notification-added", { detail: next }));
}

type Filter = "all" | "unread" | "workflows" | "issues" | "focus";

const TYPE_META: Record<Notification["type"], { icon: string; color: string }> = {
  workflow_run:     { icon: "⚡", color: "var(--accent)" },
  agent_chain:      { icon: "⛓", color: "var(--accent)" },
  recurring_issue:  { icon: "⚠", color: "var(--warning, var(--text-muted))" },
  focus_complete:   { icon: "✓", color: "var(--success, var(--text-muted))" },
  error:            { icon: "✕", color: "var(--error, #ef4444)" },
  info:             { icon: "·", color: "var(--text-muted)" },
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

function matchesFilter(n: Notification, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "unread") return !n.read;
  if (f === "workflows") return n.type === "workflow_run" || n.type === "agent_chain";
  if (f === "issues") return n.type === "recurring_issue";
  if (f === "focus") return n.type === "focus_complete";
  return true;
}

export function NotificationsCenter() {
  const [items, setItems] = useState<Notification[]>(() => load());
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = useCallback(() => setItems(load()), []);

  useEffect(() => {
    window.addEventListener("hm-notification-added", refresh);
    return () => window.removeEventListener("hm-notification-added", refresh);
  }, [refresh]);

  const markAllRead = () => {
    const next = items.map(n => ({ ...n, read: true }));
    save(next);
    setItems(next);
  };

  const clearAll = () => {
    save([]);
    setItems([]);
  };

  const markRead = (id: string) => {
    const next = items.map(n => n.id === id ? { ...n, read: true } : n);
    save(next);
    setItems(next);
  };

  const handleClick = (n: Notification) => {
    markRead(n.id);
    if (n.link) {
      window.dispatchEvent(new CustomEvent("hm-nav", { detail: n.link }));
    }
  };

  const hasUnread = items.some(n => !n.read);
  const visible = items.filter(n => matchesFilter(n, filter));

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all",       label: "All" },
    { key: "unread",    label: "Unread" },
    { key: "workflows", label: "Workflows" },
    { key: "issues",    label: "Issues" },
    { key: "focus",     label: "Focus" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1 }}>Notifications</span>
        {hasUnread && (
          <button onClick={markAllRead} style={linkBtn}>Mark all read</button>
        )}
        <button onClick={clearAll} style={linkBtn}>Clear all</button>
      </div>

      {/* Filter pills */}
      <div style={{
        display: "flex", gap: 4, padding: "6px 10px",
        borderBottom: "1px solid var(--border)", flexShrink: 0, flexWrap: "wrap",
      }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: "2px 8px", fontSize: 10, borderRadius: 4, border: "none", cursor: "pointer",
              background: filter === f.key ? "var(--bg-elevated)" : "none",
              color: filter === f.key ? "var(--text)" : "var(--text-muted)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {visible.length === 0 ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", fontSize: 12, color: "var(--text-muted)",
          }}>
            No notifications yet
          </div>
        ) : (
          visible.map(n => {
            const meta = TYPE_META[n.type];
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: "flex", gap: 10, width: "100%", textAlign: "left",
                  padding: "10px 12px", border: "none", cursor: "pointer",
                  background: n.read ? "none" : "var(--bg-elevated)",
                  borderLeft: n.read ? "2px solid transparent" : "2px solid var(--accent)",
                  borderBottom: "1px solid var(--border)",
                  fontFamily: "var(--font-sans)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-secondary)")}
                onMouseLeave={e => (e.currentTarget.style.background = n.read ? "none" : "var(--bg-elevated)")}
              >
                <span style={{ fontSize: 14, color: meta.color, flexShrink: 0, lineHeight: 1.4 }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{n.title}</div>
                  <div style={{
                    fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4,
                    overflow: "hidden", display: "-webkit-box",
                    WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>{n.body}</div>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, lineHeight: 1.8 }}>
                  {relativeTime(n.timestamp)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-sans)",
  padding: "2px 4px", borderRadius: 3,
};
