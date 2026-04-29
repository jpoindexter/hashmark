import { useState, useRef, useCallback, useEffect } from "react";
import { fetchApi, getToken } from "../lib/api";
import { Markdown } from "./Markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// ── Translation ──────────────────────────────────────────────────────────────

const LANGUAGES = [
  "Spanish", "French", "German", "Japanese", "Chinese",
  "Korean", "Portuguese", "Italian", "Arabic", "Hindi",
] as const;

type Language = (typeof LANGUAGES)[number];

let _closeActiveTranslation: (() => void) | null = null;

interface TranslatePopoverProps {
  messageContent: string;
  onClose: () => void;
}

export function TranslatePopover({ messageContent, onClose }: TranslatePopoverProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<Language | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const translate = useCallback(async (lang: Language) => {
    setText("");
    setLoading(true);
    setError(null);
    setActiveLang(lang);

    if (sessionIdRef.current) {
      void fetchApi(`/api/sessions/${sessionIdRef.current}`, { method: "DELETE" }).catch(() => {});
      sessionIdRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    let tempSessionId: string;
    try {
      const sess = await fetchApi<{ id: string }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ title: "translate-temp" }),
      });
      tempSessionId = sess.id;
      sessionIdRef.current = tempSessionId;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
      setLoading(false);
      return;
    }

    const prompt = `Translate the following text to ${lang}. Output ONLY the translated text, no explanations:\n\n${messageContent}`;

    try {
      const token = await getToken();
      const res = await fetch(`/api/sessions/${tempSessionId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: prompt }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        setError(`${res.status}: ${await res.text().catch(() => res.statusText)}`);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accum = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const evt = JSON.parse(data) as { type: string; text?: string };
            if (evt.type === "text" && evt.text) { accum += evt.text; setText(accum); }
            if (evt.type === "done") setLoading(false);
          } catch {}
        }
      }
      setLoading(false);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Streaming failed");
      }
      setLoading(false);
    }
  }, [messageContent]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (sessionIdRef.current) {
        void fetchApi(`/api/sessions/${sessionIdRef.current}`, { method: "DELETE" }).catch(() => {});
      }
    };
  }, []);

  return (
    <div style={{
      marginTop: 8,
      background: "var(--surface-2, var(--bg-elevated))",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: "10px 12px",
      maxWidth: 560,
      boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Translate
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 12, padding: "0 2px", lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
        >✕</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {LANGUAGES.map(lang => (
          <button
            key={lang}
            onClick={() => void translate(lang)}
            style={{
              fontSize: 10, padding: "3px 8px",
              background: activeLang === lang ? "var(--accent)" : "var(--bg-panel)",
              border: `1px solid ${activeLang === lang ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 4, cursor: "pointer",
              color: activeLang === lang ? "var(--bg)" : "var(--text-secondary)",
              fontFamily: "var(--font-sans)",
              transition: "all 100ms",
            }}
            onMouseEnter={e => { if (activeLang !== lang) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { if (activeLang !== lang) e.currentTarget.style.background = "var(--bg-panel)"; }}
          >{lang}</button>
        ))}
      </div>

      {(text || loading || error) && (
        <div style={{
          minHeight: 36, fontSize: 12, lineHeight: 1.65, color: "var(--text)",
          padding: "8px 10px",
          background: "var(--bg)", borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
        }}>
          {error ? (
            <span style={{ color: "var(--error, var(--red))" }}>{error}</span>
          ) : (
            <>
              <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
              {loading && (
                <span style={{
                  display: "inline-block", width: 6, height: 11,
                  background: "var(--accent)",
                  marginLeft: 2, verticalAlign: "text-bottom",
                  animation: "cursor-blink 1s step-end infinite",
                  opacity: 0.6,
                }} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function useTranslate() {
  const [showTranslate, setShowTranslate] = useState(false);

  const handleTranslate = useCallback(() => {
    if (showTranslate) {
      setShowTranslate(false);
      _closeActiveTranslation = null;
      return;
    }
    if (_closeActiveTranslation) _closeActiveTranslation();
    setShowTranslate(true);
    _closeActiveTranslation = () => setShowTranslate(false);
  }, [showTranslate]);

  const closeTranslate = useCallback(() => {
    setShowTranslate(false);
    _closeActiveTranslation = null;
  }, []);

  return { showTranslate, handleTranslate, closeTranslate };
}

// ── Quote jump (blockquote ancestor detection) ───────────────────────────────

export interface MsgRef {
  el: HTMLDivElement | null;
}

/** Extract `> ` blockquote lines from a message's raw content. Returns trimmed text of each quote block. */
export function extractBlockquotes(content: string): string[] {
  const lines = content.split("\n");
  const quotes: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("> ") || line === ">") {
      current.push(line.replace(/^>\s?/, ""));
    } else {
      if (current.length > 0) {
        quotes.push(current.join("\n").trim());
        current = [];
      }
    }
  }
  if (current.length > 0) quotes.push(current.join("\n").trim());
  return quotes.filter(q => q.length > 0);
}

/** Find the message id whose content best matches a quoted string. */
export function findAncestorId(
  quoteText: string,
  allMessages: Array<{ id: string; content: string }>,
  currentMsgId: string,
): string | null {
  const needle = quoteText.trim().toLowerCase();
  if (!needle) return null;

  for (let i = allMessages.length - 1; i >= 0; i--) {
    const m = allMessages[i];
    if (m.id === currentMsgId) continue;
    if (m.content.toLowerCase().includes(needle)) return m.id;
  }

  // Fallback: partial match on first 40 chars
  const short = needle.slice(0, 40);
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const m = allMessages[i];
    if (m.id === currentMsgId) continue;
    if (m.content.toLowerCase().includes(short)) return m.id;
  }

  return null;
}

interface QuoteJumpMarkdownProps {
  text: string;
  msgRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  allMessages: Array<{ id: string; content: string }>;
  currentMsgId: string;
}

export function QuoteJumpMarkdown({ text, msgRefs, allMessages, currentMsgId }: QuoteJumpMarkdownProps) {
  const [activePopover, setActivePopover] = useState<string | null>(null);

  const jumpToMessage = useCallback((msgId: string) => {
    const el = msgRefs.current.get(msgId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background 200ms";
    el.style.background = "color-mix(in srgb, var(--accent) 12%, transparent)";
    setTimeout(() => { el.style.background = ""; }, 1200);
  }, [msgRefs]);

  return (
    <div className="md-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          blockquote({ children }) {
            const rawText = extractTextFromChildren(children);
            const ancestorId = findAncestorId(rawText, allMessages, currentMsgId);
            const key = rawText.slice(0, 20);

            return (
              <blockquote style={{
                borderLeft: "3px solid var(--border-focus)", margin: "8px 0",
                paddingLeft: 12, color: "var(--text-dim)", fontStyle: "italic",
                position: "relative",
              }}>
                {children}
                {ancestorId && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
                    <button
                      onClick={() => jumpToMessage(ancestorId)}
                      title="Jump to source message"
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 10, color: "var(--text-muted)", padding: "0 2px",
                        fontStyle: "normal", lineHeight: 1,
                        verticalAlign: "middle",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--accent)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
                      onMouseOver={() => setActivePopover(key)}
                      onFocus={() => setActivePopover(key)}
                      onBlur={() => setActivePopover(null)}
                    >↑</button>
                    {activePopover === key && (
                      <span style={{
                        position: "absolute", left: 0, bottom: "calc(100% + 4px)",
                        background: "var(--bg-panel)", border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)", padding: "4px 8px",
                        fontSize: 10, color: "var(--text-secondary)",
                        whiteSpace: "nowrap", zIndex: 50,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        fontStyle: "normal",
                        pointerEvents: "none",
                      }}>
                        Click to jump to source
                      </span>
                    )}
                  </span>
                )}
              </blockquote>
            );
          },
          // keep all other defaults by not defining them — they fall through to react-markdown defaults
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Recursively extract plain text from react-markdown children nodes. */
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (!children) return "";
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join("");
  if (typeof children === "object" && "props" in (children as React.ReactElement)) {
    return extractTextFromChildren((children as React.ReactElement).props.children as React.ReactNode);
  }
  return "";
}
