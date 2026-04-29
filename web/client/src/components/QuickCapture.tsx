import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import type { Session } from "../types";

interface SnippetEntry {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
}

interface IssueEntry {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
}

function splitCapture(text: string): { title: string; rest: string } {
  const newline = text.indexOf("\n");
  if (newline === -1) return { title: text.trim(), rest: "" };
  return { title: text.slice(0, newline).trim(), rest: text.slice(newline + 1).trim() };
}

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [flash, setFlash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setText("");
    setFlash(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const captured = useCallback(() => {
    setFlash(true);
    setText("");
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setFlash(false);
    }, 1200);
  }, []);

  const saveAsIssue = useCallback(() => {
    if (!text.trim()) return;
    const { title, rest } = splitCapture(text);
    const issue: IssueEntry = {
      id: crypto.randomUUID(),
      title,
      description: rest,
      priority: "medium",
      status: "backlog",
      createdAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem("hm-issues");
      const issues: IssueEntry[] = raw ? (JSON.parse(raw) as IssueEntry[]) : [];
      issues.unshift(issue);
      localStorage.setItem("hm-issues", JSON.stringify(issues));
    } catch { /* ignore */ }
    captured();
  }, [text, captured]);

  const saveAsSnippet = useCallback(() => {
    if (!text.trim()) return;
    const { title } = splitCapture(text);
    const snippet: SnippetEntry = {
      id: crypto.randomUUID(),
      title,
      body: text,
      category: "captured",
      createdAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem("hm-snippets");
      const snippets: SnippetEntry[] = raw ? (JSON.parse(raw) as SnippetEntry[]) : [];
      snippets.unshift(snippet);
      localStorage.setItem("hm-snippets", JSON.stringify(snippets));
    } catch { /* ignore */ }
    captured();
  }, [text, captured]);

  const newSession = useCallback(async () => {
    if (!text.trim()) return;
    try {
      const session = await fetchApi<Session>("/api/sessions", { method: "POST", body: JSON.stringify({}) });
      await fetchApi(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ role: "user", content: text }),
      });
      localStorage.setItem("hm-last-session-id", session.id);
      window.dispatchEvent(new CustomEvent("hm-open-session", { detail: session.id }));
      toast.success("Session created");
      captured();
    } catch {
      toast.error("Failed to create session");
    }
  }, [text, captured]);

  const sendToActive = useCallback(async () => {
    if (!text.trim()) return;
    const sessionId = localStorage.getItem("hm-last-session-id");
    if (!sessionId) { toast.error("No active session"); return; }
    try {
      await fetchApi(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ role: "user", content: text }),
      });
      toast.success("Sent to active session");
      captured();
    } catch {
      toast.error("Failed to send message");
    }
  }, [text, captured]);

  // Global keyboard shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Modal keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "1") { e.preventDefault(); saveAsIssue(); }
      else if (e.key === "2") { e.preventDefault(); saveAsSnippet(); }
      else if (e.key === "3") { e.preventDefault(); void newSession(); }
      else if (e.key === "4") { e.preventDefault(); void sendToActive(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close, saveAsIssue, saveAsSnippet, newSession, sendToActive]);

  // Auto-focus textarea when modal opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

  const isMac = navigator.platform.includes("Mac");
  const mod = isMac ? "⌘" : "Ctrl";

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        title={`Quick Capture (${mod}⇧Space)`}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 50,
          width: 44, height: 44, borderRadius: "50%",
          background: "var(--accent)", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, color: "var(--bg)", fontWeight: 300,
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.45)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.35)"; }}
      >
        +
      </button>

      {/* Backdrop + modal */}
      {open && (
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "gc-fade-in 0.15s both",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 480, background: "var(--bg-panel)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              display: "flex", flexDirection: "column", gap: 0,
              animation: "qc-scale-in 0.15s both",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderBottom: "1px solid var(--border)",
              background: "var(--bg-elevated)",
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Quick Capture</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{mod}⇧Space</span>
              <div style={{ flex: 1 }} />
              <button
                onClick={close}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
              >×</button>
            </div>

            {/* Body */}
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {flash ? (
                <div style={{
                  height: 80, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: "var(--accent)", fontWeight: 500,
                  animation: "gc-fade-in 0.2s both",
                }}>
                  Captured
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Capture a thought, task, or message..."
                  rows={3}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "var(--bg)", border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)", padding: "8px 10px",
                    fontSize: 13, color: "var(--text)", fontFamily: "var(--font-sans)",
                    lineHeight: 1.6, resize: "vertical", outline: "none",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              )}

              {!flash && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <ActionBtn label="Save as Issue" hint={`${mod}1`} onClick={saveAsIssue} />
                  <ActionBtn label="Save as Snippet" hint={`${mod}2`} onClick={saveAsSnippet} />
                  <ActionBtn label="New Session" hint={`${mod}3`} onClick={() => void newSession()} />
                  <ActionBtn label="Send to active" hint={`${mod}4`} onClick={() => void sendToActive()} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes qc-scale-in {
          from { opacity: 0; transform: scale(0.95) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}

function ActionBtn({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 10px", fontSize: 11, cursor: "pointer",
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", color: "var(--text)",
        fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 5,
        transition: "border-color 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {label}
      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{hint}</span>
    </button>
  );
}
