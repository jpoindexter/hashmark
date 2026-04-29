import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PinnedMessage {
  sessionId: string;
  messageId: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const REACTIONS_KEY = "hm-reactions";
const MY_REACTIONS_KEY = "hm-my-reactions";
const PINNED_KEY = "hm-pinned-messages";

type ReactionsStore = Record<string, Record<string, number>>;
type MyReactionsStore = Record<string, string[]>;

function loadReactions(): ReactionsStore {
  try {
    const raw = localStorage.getItem(REACTIONS_KEY);
    return raw ? (JSON.parse(raw) as ReactionsStore) : {};
  } catch { return {}; }
}

function saveReactions(s: ReactionsStore): void {
  localStorage.setItem(REACTIONS_KEY, JSON.stringify(s));
}

function loadMyReactions(): MyReactionsStore {
  try {
    const raw = localStorage.getItem(MY_REACTIONS_KEY);
    return raw ? (JSON.parse(raw) as MyReactionsStore) : {};
  } catch { return {}; }
}

function saveMyReactions(s: MyReactionsStore): void {
  localStorage.setItem(MY_REACTIONS_KEY, JSON.stringify(s));
}

export function loadPinned(): PinnedMessage[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? (JSON.parse(raw) as PinnedMessage[]) : [];
  } catch { return []; }
}

export function savePinned(items: PinnedMessage[]): void {
  localStorage.setItem(PINNED_KEY, JSON.stringify(items));
}

// ── Emoji Reactions ───────────────────────────────────────────────────────────

const REACTION_EMOJIS = ["👍", "👎", "❤️", "😂", "😮", "😢", "🔥", "💯", "🎉", "🤔", "✅", "❌"] as const;

interface ReactionBarProps {
  messageId: string;
}

export function ReactionBar({ messageId }: ReactionBarProps) {
  const [reactions, setReactions] = useState<Record<string, number>>(() => {
    const store = loadReactions();
    return store[messageId] ?? {};
  });
  const [myReactions, setMyReactions] = useState<Set<string>>(() => {
    const store = loadMyReactions();
    return new Set(store[messageId] ?? []);
  });
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const toggleReaction = useCallback((emoji: string) => {
    setReactions(prev => {
      const next = { ...prev };
      setMyReactions(prevMine => {
        const nextMine = new Set(prevMine);
        if (nextMine.has(emoji)) {
          // decrement / remove
          nextMine.delete(emoji);
          const count = (next[emoji] ?? 1) - 1;
          if (count <= 0) delete next[emoji]; else next[emoji] = count;
        } else {
          // increment
          nextMine.add(emoji);
          next[emoji] = (next[emoji] ?? 0) + 1;
        }
        // persist my reactions
        const store = loadMyReactions();
        store[messageId] = [...nextMine];
        saveMyReactions(store);
        return nextMine;
      });
      // persist reactions
      const store = loadReactions();
      store[messageId] = next;
      saveReactions(store);
      return next;
    });
    setShowPicker(false);
  }, [messageId]);

  const hasReactions = Object.keys(reactions).length > 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: hasReactions ? 6 : 0 }}>
      {/* Existing reaction pills */}
      {Object.entries(reactions).map(([emoji, count]) => (
        <button
          key={emoji}
          onClick={() => toggleReaction(emoji)}
          title={myReactions.has(emoji) ? "Remove your reaction" : "Add your reaction"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "1px 7px", fontSize: 11, lineHeight: "18px",
            background: myReactions.has(emoji)
              ? "color-mix(in srgb, var(--accent) 18%, var(--surface-2, var(--bg-elevated)))"
              : "var(--surface-2, var(--bg-elevated))",
            border: `1px solid ${myReactions.has(emoji) ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 10, cursor: "pointer",
            color: "var(--text)",
            fontFamily: "var(--font-sans)",
            transition: "all 100ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = myReactions.has(emoji) ? "var(--accent)" : "var(--border)"; }}
        >
          <span>{emoji}</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <div ref={pickerRef} style={{ position: "relative" }}>
        <button
          onClick={() => setShowPicker(v => !v)}
          title="Add reaction"
          style={{
            background: showPicker ? "var(--bg-elevated)" : "none",
            border: `1px solid ${showPicker ? "var(--border)" : "transparent"}`,
            borderRadius: 10, cursor: "pointer",
            padding: "1px 6px", fontSize: 11, lineHeight: "18px",
            color: "var(--text-muted)",
            transition: "all 100ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.borderColor = "var(--border)"; }}
          onMouseLeave={e => { if (!showPicker) { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent"; } }}
        >+</button>

        {showPicker && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: 0,
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "6px 8px",
            display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 100,
          }}>
            {REACTION_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                style={{
                  background: myReactions.has(emoji) ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "none",
                  border: "1px solid transparent", borderRadius: 4,
                  cursor: "pointer", padding: "3px 4px",
                  fontSize: 16, lineHeight: 1, transition: "background 80ms",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = myReactions.has(emoji) ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "none"; }}
              >{emoji}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pinned Messages panel ─────────────────────────────────────────────────────

interface PinnedPanelProps {
  sessionId: string;
  onClose: () => void;
  onJump: (messageId: string) => void;
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function PinnedPanel({ sessionId, onClose, onJump }: PinnedPanelProps) {
  const [items, setItems] = useState<PinnedMessage[]>(() =>
    loadPinned().filter(p => p.sessionId === sessionId)
  );

  const unpin = (messageId: string) => {
    const all = loadPinned().filter(p => !(p.sessionId === sessionId && p.messageId === messageId));
    savePinned(all);
    setItems(all.filter(p => p.sessionId === sessionId));
  };

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0,
      width: 280, zIndex: 50,
      background: "var(--bg-panel)", borderLeft: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      boxShadow: "-4px 0 16px rgba(0,0,0,0.25)",
      animation: "slide-in-right 0.18s cubic-bezier(0.16,1,0.3,1) both",
    } as React.CSSProperties}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", letterSpacing: "0.02em" }}>
          Pinned Messages
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
        >✕</button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: "auto", padding: "6px 0" }}>
        {items.length === 0 ? (
          <div style={{ padding: "24px 16px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
            No pinned messages in this session
          </div>
        ) : (
          items.map(item => (
            <div
              key={item.messageId}
              style={{
                padding: "8px 12px", cursor: "pointer",
                borderBottom: "1px solid var(--border)",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
              onClick={() => { onJump(item.messageId); onClose(); }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.07em", padding: "1px 5px", borderRadius: 3,
                  background: item.role === "user"
                    ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                    : "color-mix(in srgb, var(--green) 15%, transparent)",
                  color: item.role === "user" ? "var(--accent)" : "var(--green)",
                }}>{item.role}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{relativeTime(item.timestamp)}</span>
                  <button
                    onClick={e => { e.stopPropagation(); unpin(item.messageId); }}
                    title="Unpin"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 11, padding: "0 2px", lineHeight: 1 }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--red)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
                  >×</button>
                </div>
              </div>
              <div style={{
                fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5,
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
              } as React.CSSProperties}>
                {item.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── usePinned hook (used in MessageBubble) ────────────────────────────────────

export function usePinned(sessionId: string, messageId: string) {
  const [pinned, setPinned] = useState(() =>
    loadPinned().some(p => p.sessionId === sessionId && p.messageId === messageId)
  );

  const togglePin = useCallback((content: string, role: "user" | "assistant") => {
    const all = loadPinned();
    if (pinned) {
      savePinned(all.filter(p => !(p.sessionId === sessionId && p.messageId === messageId)));
      setPinned(false);
    } else {
      const item: PinnedMessage = {
        sessionId,
        messageId,
        content: content.slice(0, 100),
        role,
        timestamp: new Date().toISOString(),
      };
      savePinned([...all, item]);
      setPinned(true);
    }
    // Notify ChatPane to refresh its count
    window.dispatchEvent(new CustomEvent("hm-pinned-changed", { detail: { sessionId } }));
  }, [sessionId, messageId, pinned]);

  return { pinned, togglePin };
}
