import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { toast } from "./Toasts";
import { fetchApi, getToken } from "../lib/api";

export type Snippet = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  language?: string;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
};

const STORAGE_KEY = "hm-snippets";
const DAILY_USAGE_KEY = "hm-snippets-daily-usage";

const DEFAULT_SNIPPETS: Snippet[] = [
  {
    id: "default-1",
    title: "Fix this bug",
    content: "Please review this code and fix the bug: \n\n```\n{{code}}\n```",
    category: "Prompts",
    tags: ["debug", "review"],
    usageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
  },
  {
    id: "default-2",
    title: "Code review",
    content: "Review this code for bugs, performance issues, and improvements:\n\n```\n{{code}}\n```",
    category: "Prompts",
    tags: ["review", "quality"],
    usageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
  },
  {
    id: "default-3",
    title: "Git commit message",
    content: "Write a concise git commit message for these changes:\n\n{{diff}}",
    category: "Prompts",
    tags: ["git"],
    usageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
  },
  {
    id: "default-4",
    title: "TODO comment",
    content: "// TODO: {{description}}",
    category: "Code",
    tags: ["comment"],
    language: "typescript",
    usageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
  },
  {
    id: "default-5",
    title: "Console log",
    content: "console.log('{{label}}:', {{value}});",
    category: "Code",
    tags: ["debug"],
    language: "typescript",
    usageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
  },
  {
    id: "default-6",
    title: "Explain this",
    content: "Explain what this code does in simple terms:\n\n```\n{{code}}\n```",
    category: "Prompts",
    tags: ["explain"],
    usageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
  },
];

function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Snippet[];
  } catch { /* ignore */ }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SNIPPETS));
  return DEFAULT_SNIPPETS;
}

function saveSnippets(snippets: Snippet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
}

function loadDailyUsage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DAILY_USAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, number>;
  } catch { /* ignore */ }
  return {};
}

function saveDailyUsage(data: Record<string, number>) {
  localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(data));
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function extractVars(content: string): string[] {
  const matches = content.matchAll(/\{\{(\w+)\}\}/g);
  const seen = new Set<string>();
  const vars: string[] = [];
  for (const m of matches) {
    if (!seen.has(m[1])) { seen.add(m[1]); vars.push(m[1]); }
  }
  return vars;
}

// ── Variable fill-in dialog ────────────────────────────────────────────────────

function VarFillDialog({
  snippet,
  vars,
  onConfirm,
  onCancel,
}: {
  snippet: Snippet;
  vars: string[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(vars.map(v => [v, ""]))
  );
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: 20, width: 360,
        display: "flex", flexDirection: "column", gap: 14,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          Fill in variables — {snippet.title}
        </div>
        {vars.map((v, i) => (
          <div key={v} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{v}</label>
            <input
              ref={i === 0 ? firstRef : undefined}
              value={values[v]}
              onChange={e => setValues(prev => ({ ...prev, [v]: e.target.value }))}
              placeholder={v}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onConfirm(values); }
                if (e.key === "Escape") onCancel();
              }}
              style={{
                background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", padding: "6px 10px",
                fontSize: 12, color: "var(--text)", outline: "none", width: "100%", boxSizing: "border-box",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 14px", fontSize: 12, background: "var(--bg-elevated)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
              cursor: "pointer", color: "var(--text-secondary)",
            }}
          >Cancel</button>
          <button
            onClick={() => onConfirm(values)}
            style={{
              padding: "6px 14px", fontSize: 12, background: "var(--accent)",
              border: "none", borderRadius: "var(--radius-md)",
              cursor: "pointer", color: "var(--text-on-accent)",
            }}
          >Insert</button>
        </div>
      </div>
    </div>
  );
}

// ── Snippet edit form ──────────────────────────────────────────────────────────

function SnippetForm({
  initial,
  categories,
  onSave,
  onCancel,
}: {
  initial: Partial<Snippet>;
  categories: string[];
  onSave: (data: Omit<Snippet, "id" | "usageCount" | "createdAt" | "updatedAt" | "pinned">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [content, setContent] = useState(initial.content ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [tagsStr, setTagsStr] = useState((initial.tags ?? []).join(", "));
  const [language, setLanguage] = useState(initial.language ?? "");

  const catListId = "snippet-categories-" + Math.random().toString(36).slice(2, 6);

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px",
      background: "var(--bg-panel)", borderBottom: "1px solid var(--border)",
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
        {initial.id ? "Edit Snippet" : "New Snippet"}
      </div>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Title"
        style={inputStyle}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
        onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
      />

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Content (use {{variable}} for fill-in placeholders)"
        rows={6}
        style={{ ...inputStyle, fontFamily: "var(--font-mono)", resize: "vertical", minHeight: 100 }}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
        onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <input
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="Category"
            list={catListId}
            style={inputStyle}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <datalist id={catListId}>
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <input
          value={language}
          onChange={e => setLanguage(e.target.value)}
          placeholder="Language (optional)"
          style={{ ...inputStyle, flex: 1 }}
          onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
          onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>

      <input
        value={tagsStr}
        onChange={e => setTagsStr(e.target.value)}
        placeholder="Tags (comma separated)"
        style={inputStyle}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
        onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={btnSecondaryStyle}>Cancel</button>
        <button
          onClick={() => {
            if (!title.trim()) { toast.error("Title is required"); return; }
            if (!content.trim()) { toast.error("Content is required"); return; }
            onSave({
              title: title.trim(),
              content: content.trim(),
              category: category.trim() || "General",
              tags: tagsStr.split(",").map(t => t.trim()).filter(Boolean),
              language: language.trim() || undefined,
            });
          }}
          style={btnPrimaryStyle}
        >Save</button>
      </div>
    </div>
  );
}

// ── AI Generator ──────────────────────────────────────────────────────────────

function GenerateTab({
  categories,
  onSaveGenerated,
}: {
  categories: string[];
  onSaveGenerated: (initial: Partial<Snippet>) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [generated, setGenerated] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const catListId = "gen-categories-" + useRef(Math.random().toString(36).slice(2, 6)).current;

  const generate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setGenerated("");

    try {
      const token = await getToken();
      // Create a temporary session
      const sessionRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ title: "__snippet_gen_temp__" }),
        signal: controller.signal,
      });
      if (!sessionRes.ok) throw new Error("Failed to create session");
      const session = await sessionRes.json() as { id: string };

      const langHint = language.trim() ? ` Language hint: ${language.trim()}.` : "";
      const catHint = category.trim() ? ` Category: ${category.trim()}.` : "";
      const msg =
        `Generate a reusable prompt snippet for: ${prompt.trim()}.${catHint}${langHint} ` +
        `Format: provide ONLY the snippet text (no explanation, no preamble, no markdown code fences wrapping the whole thing), ` +
        `use {{variable}} placeholders for customizable parts. Keep it under 200 words.`;

      const chatRes = await fetch(`/api/sessions/${session.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: msg }),
        signal: controller.signal,
      });
      if (!chatRes.ok || !chatRes.body) throw new Error("Stream failed");

      const reader = chatRes.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let accum = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        const raw = line.slice(6).trim();
        if (!raw) return;
        try {
          const evt = JSON.parse(raw) as { type: string; text?: string };
          if (evt.type === "text" && evt.text) {
            accum += evt.text;
            setGenerated(accum);
          }
        } catch { /* ignore */ }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      }
      if (buf) processLine(buf);

      // Clean up temp session
      fetch(`/api/sessions/${session.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      setLoading(false);
    }
  }, [prompt, category, language, loading]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", flex: 1, overflow: "auto" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        Describe what you need — AI will generate a reusable snippet with {"{{"} variable {"}}"}  placeholders.
      </div>

      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Describe what you need a snippet for..."
        rows={3}
        style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
        onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <input
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="Category (optional)"
            list={catListId}
            style={inputStyle}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <datalist id={catListId}>
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <input
          value={language}
          onChange={e => setLanguage(e.target.value)}
          placeholder="Language (optional)"
          style={{ ...inputStyle, flex: 1 }}
          onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
          onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={generate}
          disabled={!prompt.trim() || loading}
          style={{
            ...btnPrimaryStyle,
            opacity: (!prompt.trim() || loading) ? 0.5 : 1,
            cursor: (!prompt.trim() || loading) ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Generating..." : "Generate"}
        </button>
        {generated && (
          <button onClick={generate} disabled={loading} style={{ ...btnSecondaryStyle, opacity: loading ? 0.5 : 1 }}>
            Regenerate
          </button>
        )}
      </div>

      {generated && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Preview (editable)</div>
          <textarea
            value={generated}
            onChange={e => setGenerated(e.target.value)}
            rows={8}
            style={{ ...inputStyle, fontFamily: "var(--font-mono)", resize: "vertical", minHeight: 120 }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <button
            onClick={() => {
              if (!generated.trim()) return;
              onSaveGenerated({
                content: generated.trim(),
                category: category.trim() || "Prompts",
                language: language.trim() || undefined,
                tags: [],
              });
            }}
            style={btnPrimaryStyle}
          >
            Save as snippet
          </button>
        </>
      )}
    </div>
  );
}

// ── Analytics tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({
  snippets,
  onResetUsage,
  onDelete,
}: {
  snippets: Snippet[];
  onResetUsage: () => void;
  onDelete: (id: string) => void;
}) {
  const totalInserts = snippets.reduce((s, x) => s + x.usageCount, 0);

  const mostUsedCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of snippets) counts[s.category] = (counts[s.category] ?? 0) + s.usageCount;
    let best = "—"; let max = 0;
    for (const [cat, n] of Object.entries(counts)) { if (n > max) { max = n; best = cat; } }
    return max > 0 ? best : "—";
  }, [snippets]);

  const top5 = useMemo(() =>
    [...snippets].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5).filter(s => s.usageCount > 0),
    [snippets]
  );

  const unused = useMemo(() => snippets.filter(s => s.usageCount === 0), [snippets]);

  const maxCount = top5[0]?.usageCount ?? 1;

  const dailyUsage = loadDailyUsage();
  const sparkDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const sparkValues = sparkDays.map(d => dailyUsage[d] ?? 0);
  const sparkMax = Math.max(...sparkValues, 1);

  const W = 200, H = 40, PAD = 4;
  const pts = sparkValues.map((v, i) => {
    const x = PAD + (i / 6) * (W - PAD * 2);
    const y = H - PAD - ((v / sparkMax) * (H - PAD * 2));
    return `${x},${y}`;
  }).join(" ");

  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "12px 14px", flex: 1, overflow: "auto" }}>
      {/* Summary row */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { label: "Snippets", value: snippets.length },
          { label: "Total inserts", value: totalInserts },
          { label: "Top category", value: mostUsedCategory },
        ].map(({ label, value }) => (
          <div key={label} style={{
            flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{value}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* 7-day sparkline */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Inserts — last 7 days</div>
        <svg width={W} height={H} style={{ overflow: "visible", display: "block" }}>
          <polyline
            points={pts}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {sparkValues.map((v, i) => {
            const x = PAD + (i / 6) * (W - PAD * 2);
            const y = H - PAD - ((v / sparkMax) * (H - PAD * 2));
            return <circle key={i} cx={x} cy={y} r={2.5} fill="var(--accent)" />;
          })}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          {sparkDays.map(d => (
            <span key={d} style={{ fontSize: 9, color: "var(--text-muted)" }}>{d.slice(5)}</span>
          ))}
        </div>
      </div>

      {/* Top 5 */}
      {top5.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Top snippets</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {top5.map(s => (
              <div key={s.id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{s.title}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{s.usageCount}x</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-elevated)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(s.usageCount / maxCount) * 100}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unused snippets */}
      {unused.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            Never used ({unused.length}) — suggested cleanup
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {unused.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                <button
                  onClick={() => onDelete(s.id)}
                  style={{ ...btnSecondaryStyle, padding: "2px 8px", fontSize: 10, flexShrink: 0 }}
                >Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reset */}
      <div style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        {confirmReset ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Reset all usage counts?</span>
            <button onClick={() => { onResetUsage(); setConfirmReset(false); }} style={{ ...btnPrimaryStyle, background: "var(--error, #ef4444)" }}>Yes, reset</button>
            <button onClick={() => setConfirmReset(false)} style={btnSecondaryStyle}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmReset(true)} style={btnSecondaryStyle}>Reset usage stats</button>
        )}
      </div>
    </div>
  );
}

// ── Share popover ──────────────────────────────────────────────────────────────

function SharePopover({ snippet, onClose }: { snippet: Snippet; onClose: () => void }) {
  const code = useMemo(() => {
    const { id: _id, usageCount: _u, createdAt: _c, updatedAt: _up, ...rest } = snippet;
    return btoa(unescape(encodeURIComponent(JSON.stringify(rest))));
  }, [snippet]);

  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!textRef.current?.closest("[data-share-popover]")?.contains(target)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      data-share-popover=""
      style={{
        position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 100,
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: 12, width: 280,
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>Share code</div>
      <textarea
        ref={textRef}
        readOnly
        value={code}
        rows={3}
        style={{
          ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 10, resize: "none",
          userSelect: "all", cursor: "text",
        }}
        onFocus={e => e.currentTarget.select()}
      />
      <button
        onClick={() => { void navigator.clipboard.writeText(code); toast.success("Code copied"); onClose(); }}
        style={btnPrimaryStyle}
      >
        Copy code
      </button>
    </div>
  );
}

// ── Snippet card ───────────────────────────────────────────────────────────────

function SnippetCard({
  snippet,
  onInsert,
  onEdit,
  onPin,
  onDelete,
}: {
  snippet: Snippet;
  onInsert: (s: Snippet) => void;
  onEdit: (s: Snippet) => void;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const preview = snippet.content.length > 80 ? snippet.content.slice(0, 80) + "…" : snippet.content;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onInsert(snippet)}
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        background: hovered ? "var(--bg-elevated)" : "transparent",
        transition: "background 0.1s",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {snippet.pinned && <span style={{ color: "var(--accent)", marginRight: 4, fontSize: 10 }}>▲</span>}
          {snippet.title}
        </span>
        <span style={{
          fontSize: 10, padding: "1px 6px", borderRadius: 10,
          background: "var(--bg-elevated)", color: "var(--text-muted)",
          border: "1px solid var(--border)", flexShrink: 0,
        }}>
          {snippet.category}
        </span>
        {snippet.language && (
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 10,
            background: "var(--accent-dim, rgba(99,102,241,0.15))", color: "var(--accent)",
            flexShrink: 0,
          }}>
            {snippet.language}
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 6, lineHeight: 1.5, wordBreak: "break-all" }}>
        {preview}
      </div>

      {snippet.tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
          {snippet.tags.map(tag => (
            <span key={tag} style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 10,
              background: "var(--bg)", color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}>{tag}</span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {snippet.usageCount > 0
          ? <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Used {snippet.usageCount}×</span>
          : <span />}

        {hovered && (
          <div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
            <ActionBtn title="Copy" onClick={() => { void navigator.clipboard.writeText(snippet.content); toast.success("Copied"); }}>📋</ActionBtn>
            <ActionBtn title="Edit" onClick={() => onEdit(snippet)}>✏️</ActionBtn>
            <ActionBtn title={snippet.pinned ? "Unpin" : "Pin"} onClick={() => onPin(snippet.id)}>{snippet.pinned ? "📌" : "📍"}</ActionBtn>
            <div style={{ position: "relative" }} ref={shareRef}>
              <ActionBtn title="Share" onClick={() => setShareOpen(v => !v)}>↗</ActionBtn>
              {shareOpen && (
                <SharePopover snippet={snippet} onClose={() => setShareOpen(false)} />
              )}
            </div>
            <ActionBtn title="Delete" onClick={() => onDelete(snippet.id)}>🗑</ActionBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
        padding: "2px 6px", cursor: "pointer", fontSize: 12, lineHeight: 1.4, color: "var(--text)",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {children}
    </button>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

type PanelTab = "snippets" | "generate" | "analytics";

export function SnippetsPanel() {
  const [snippets, setSnippets] = useState<Snippet[]>(loadSnippets);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [editing, setEditing] = useState<Snippet | null | "new">(null);
  const [varFill, setVarFill] = useState<{ snippet: Snippet; vars: string[] } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("snippets");
  const [importCode, setImportCode] = useState("");
  const [generatePreFill, setGeneratePreFill] = useState<Partial<Snippet> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveSnippets(snippets);
  }, [snippets]);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const categories = useMemo(() => {
    const cats = [...new Set(snippets.map(s => s.category))].sort();
    return cats;
  }, [snippets]);

  const filtered = useMemo(() => {
    let list = snippets;
    if (activeCategory !== "All") {
      if (activeCategory === "Pinned") list = list.filter(s => s.pinned);
      else list = list.filter(s => s.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [snippets, activeCategory, search]);

  const hasPinned = snippets.some(s => s.pinned);

  const recordInsert = () => {
    const key = todayKey();
    const data = loadDailyUsage();
    data[key] = (data[key] ?? 0) + 1;
    saveDailyUsage(data);
  };

  const insertSnippet = (snippet: Snippet) => {
    const vars = extractVars(snippet.content);
    if (vars.length > 0) {
      setVarFill({ snippet, vars });
      return;
    }
    dispatchInsert(snippet, {});
  };

  const dispatchInsert = (snippet: Snippet, values: Record<string, string>) => {
    let content = snippet.content;
    for (const [k, v] of Object.entries(values)) {
      content = content.replaceAll(`{{${k}}}`, v);
    }
    window.dispatchEvent(new CustomEvent("hm-insert-snippet", { detail: { content } }));
    setSnippets(prev => prev.map(s => s.id === snippet.id ? { ...s, usageCount: s.usageCount + 1 } : s));
    recordInsert();
    setVarFill(null);
    toast.success("Snippet inserted");
  };

  const saveSnippet = (data: Omit<Snippet, "id" | "usageCount" | "createdAt" | "updatedAt" | "pinned">) => {
    if (editing === "new") {
      const now = Date.now();
      const s: Snippet = { ...data, id: genId(), usageCount: 0, createdAt: now, updatedAt: now, pinned: false };
      setSnippets(prev => [s, ...prev]);
      toast.success("Snippet created");
    } else if (editing) {
      setSnippets(prev => prev.map(s => s.id === (editing as Snippet).id ? { ...s, ...data, updatedAt: Date.now() } : s));
      toast.success("Snippet updated");
    }
    setEditing(null);
  };

  const deleteSnippet = (id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
  };

  const pinSnippet = (id: string) => {
    setSnippets(prev => prev.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s));
  };

  const resetUsage = () => {
    setSnippets(prev => prev.map(s => ({ ...s, usageCount: 0 })));
    saveDailyUsage({});
    toast.success("Usage stats reset");
  };

  const exportAll = () => {
    const json = JSON.stringify(snippets, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hashmark-snippets.json"; a.click();
    URL.revokeObjectURL(url);
    setShowMenu(false);
  };

  const importFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as Snippet[];
        if (!Array.isArray(imported)) { toast.error("Invalid file format"); return; }
        setSnippets(prev => {
          const existingTitles = new Set(prev.map(s => s.title.toLowerCase()));
          const newOnes = imported.filter(s => !existingTitles.has(s.title.toLowerCase()));
          toast.success(`Imported ${newOnes.length} snippets (${imported.length - newOnes.length} dupes skipped)`);
          return [...prev, ...newOnes];
        });
      } catch { toast.error("Failed to parse JSON"); }
    };
    reader.readAsText(file);
    e.target.value = "";
    setShowMenu(false);
  };

  const importFromCode = () => {
    const code = importCode.trim();
    if (!code) return;
    try {
      const json = decodeURIComponent(escape(atob(code)));
      const data = JSON.parse(json) as Partial<Snippet>;
      if (!data.title || !data.content) { toast.error("Invalid share code"); return; }
      const now = Date.now();
      const s: Snippet = {
        id: genId(),
        title: data.title,
        content: data.content,
        category: data.category ?? "General",
        tags: Array.isArray(data.tags) ? data.tags : [],
        language: data.language,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
        pinned: false,
      };
      setSnippets(prev => [s, ...prev]);
      setImportCode("");
      toast.success(`Imported "${s.title}"`);
    } catch {
      toast.error("Invalid share code");
    }
  };

  const catTabs = ["All", ...(hasPinned ? ["Pinned"] : []), ...categories];

  const editingSnippet = editing !== null && editing !== "new" ? editing as Snippet : null;

  const panelTabs: { id: PanelTab; label: string }[] = [
    { id: "snippets", label: "Snippets" },
    { id: "generate", label: "Generate" },
    { id: "analytics", label: "Analytics" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Top tab bar */}
      <div style={{
        display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0,
        background: "var(--bg-panel)",
      }}>
        {panelTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setPanelTab(tab.id)}
            style={{
              flex: 1, padding: "8px 4px", fontSize: 11, fontWeight: panelTab === tab.id ? 600 : 400,
              background: "transparent", border: "none", cursor: "pointer",
              color: panelTab === tab.id ? "var(--text)" : "var(--text-muted)",
              borderBottom: panelTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "color 0.1s",
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* Generate tab */}
      {panelTab === "generate" && (
        <GenerateTab
          categories={categories}
          onSaveGenerated={(initial) => {
            setPanelTab("snippets");
            // Use "new" sentinel so saveSnippet creates rather than updates.
            // SnippetForm receives initial as a Partial<Snippet> — id absent triggers new-snippet path.
            setEditing("new");
            setGeneratePreFill(initial);
          }}
        />
      )}

      {/* Analytics tab */}
      {panelTab === "analytics" && (
        <AnalyticsTab
          snippets={snippets}
          onResetUsage={resetUsage}
          onDelete={deleteSnippet}
        />
      )}

      {/* Snippets tab */}
      {panelTab === "snippets" && (
        <>
          {/* Import from code row */}
          <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", gap: 6 }}>
            <input
              value={importCode}
              onChange={e => setImportCode(e.target.value)}
              placeholder="Import from share code..."
              style={{ ...inputStyle, flex: 1, fontSize: 11 }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
              onKeyDown={e => { if (e.key === "Enter") importFromCode(); }}
            />
            <button
              onClick={importFromCode}
              disabled={!importCode.trim()}
              style={{ ...btnSecondaryStyle, opacity: importCode.trim() ? 1 : 0.4, flexShrink: 0 }}
            >Import</button>
          </div>

          {/* Search row */}
          <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search snippets..."
              style={{ ...inputStyle, flex: 1 }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
            <button
              onClick={() => { setEditing("new"); }}
              style={{ ...btnPrimaryStyle, whiteSpace: "nowrap", flexShrink: 0 }}
              title="New Snippet"
            >+ New</button>
            <div style={{ position: "relative" }} ref={menuRef}>
              <button
                onClick={() => setShowMenu(v => !v)}
                style={{ ...btnSecondaryStyle, padding: "5px 8px" }}
                title="More options"
              >⋯</button>
              {showMenu && (
                <div style={{
                  position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50,
                  background: "var(--bg-panel)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)", minWidth: 140,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                  overflow: "hidden",
                }}>
                  <button onClick={exportAll} style={menuItemStyle}>Export all</button>
                  <button onClick={() => importRef.current?.click()} style={menuItemStyle}>Import JSON</button>
                </div>
              )}
            </div>
            <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importFile} />
          </div>

          {/* Category tabs */}
          <div style={{
            display: "flex", gap: 2, padding: "6px 12px", borderBottom: "1px solid var(--border)",
            flexShrink: 0, overflowX: "auto", scrollbarWidth: "none",
          }}>
            {catTabs.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: "3px 10px", fontSize: 11, borderRadius: 12,
                  border: "1px solid " + (activeCategory === cat ? "var(--accent)" : "var(--border)"),
                  background: activeCategory === cat ? "var(--accent)" : "var(--bg-elevated)",
                  color: activeCategory === cat ? "var(--text-on-accent)" : "var(--text-muted)",
                  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >{cat}</button>
            ))}
          </div>

          {/* Edit / new form */}
          {editing !== null && (
            <SnippetForm
              initial={editing === "new" ? (generatePreFill ?? {}) : editingSnippet!}
              categories={categories}
              onSave={(data) => { setGeneratePreFill(null); saveSnippet(data); }}
              onCancel={() => { setEditing(null); setGeneratePreFill(null); }}
            />
          )}

          {/* Snippet list */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {filtered.length === 0 && (
              <div style={{ padding: 20, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                {snippets.length === 0 ? "No snippets yet. Create one!" : "No snippets match your search."}
              </div>
            )}
            {filtered.map(snippet => (
              <SnippetCard
                key={snippet.id}
                snippet={snippet}
                onInsert={insertSnippet}
                onEdit={s => setEditing(s)}
                onPin={pinSnippet}
                onDelete={deleteSnippet}
              />
            ))}
          </div>
        </>
      )}

      {/* Var fill dialog */}
      {varFill && (
        <VarFillDialog
          snippet={varFill.snippet}
          vars={varFill.vars}
          onConfirm={(values) => dispatchInsert(varFill.snippet, values)}
          onCancel={() => setVarFill(null)}
        />
      )}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  padding: "5px 9px",
  fontSize: 12,
  color: "var(--text)",
  outline: "none",
  boxSizing: "border-box",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "5px 12px", fontSize: 11,
  background: "var(--accent)", color: "var(--text-on-accent)",
  border: "none", borderRadius: "var(--radius-md)", cursor: "pointer",
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: "5px 10px", fontSize: 11,
  background: "var(--bg-elevated)", color: "var(--text-secondary)",
  border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer",
};

const menuItemStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "8px 14px", fontSize: 12,
  background: "transparent", border: "none", textAlign: "left",
  cursor: "pointer", color: "var(--text)", borderBottom: "1px solid var(--border)",
};
