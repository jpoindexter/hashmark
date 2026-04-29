import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi, apiUrl } from "../lib/api";
import { toast } from "./Toasts";
import type { Session } from "../types";

const MODELS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gpt-4o",
  "gpt-4o-mini",
] as const;

type Model = (typeof MODELS)[number];

interface PlaygroundConfig {
  model: Model;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

interface HistoryEntry {
  id: string;
  prompt: string;
  response: string;
  config: PlaygroundConfig;
  timestamp: number;
  latencyMs: number;
}

interface Preset {
  id: string;
  name: string;
  config: PlaygroundConfig;
  agentId?: string;
}

const HISTORY_KEY = "hm-playground-history";
const PRESETS_KEY = "hm-playground-presets";
const SNIPPETS_KEY = "hm-snippets";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadHistory(): HistoryEntry[] {
  try {
    return (JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryEntry[]).slice(0, 10);
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 10)));
}

function loadPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]") as Preset[];
  } catch { return []; }
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function approxTokens(text: string): number {
  return Math.round(text.length / 4);
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── Save as agent preset dialog ────────────────────────────────────────────────

function SavePresetDialog({
  config,
  onSave,
  onClose,
}: {
  config: PlaygroundConfig;
  onSave: (preset: Preset) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async () => {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    try {
      const agent = await fetchApi<{ id: string }>("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          name: n,
          model: config.model,
          system_prompt: config.systemPrompt,
        }),
      });
      const preset: Preset = { id: uid(), name: n, config, agentId: agent.id };
      onSave(preset);
      toast(`Saved preset "${n}"`);
    } catch {
      toast.error("Failed to save preset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: 8, width: 300, padding: 20,
        boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Save as agent preset</div>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void submit(); if (e.key === "Escape") onClose(); }}
          placeholder="Preset name..."
          style={{
            fontSize: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 4, padding: "6px 8px", color: "var(--text)",
            outline: "none", fontFamily: "var(--font-sans)", width: "100%", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ fontSize: 11, padding: "4px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--text)", fontFamily: "var(--font-sans)" }}
          >Cancel</button>
          <button
            onClick={() => void submit()}
            disabled={saving || !name.trim()}
            style={{ fontSize: 11, padding: "4px 12px", background: "var(--accent)", border: "none", borderRadius: 4, cursor: saving ? "not-allowed" : "pointer", color: "#fff", fontFamily: "var(--font-sans)", opacity: saving || !name.trim() ? 0.5 : 1 }}
          >{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AIPlayground() {
  const [config, setConfig] = useState<PlaygroundConfig>({
    model: "claude-sonnet-4-6",
    temperature: 1.0,
    maxTokens: 1024,
    systemPrompt: "",
  });
  const [systemOpen, setSystemOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [running, setRunning] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { promptRef.current?.focus(); }, []);

  const updateConfig = <K extends keyof PlaygroundConfig>(key: K, value: PlaygroundConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const run = useCallback(async () => {
    const p = prompt.trim();
    if (!p || running) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setRunning(true);
    setResponse("");
    setLatencyMs(null);
    const startMs = Date.now();

    try {
      // Create a temp session
      const session = await fetchApi<Session>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: "__playground_tmp__",
          model: config.model,
          system_prompt: config.systemPrompt || undefined,
        }),
      });

      // Send message
      await fetchApi(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ role: "user", content: p }),
      });

      // Stream response
      const streamUrl = await apiUrl(`/api/sessions/${session.id}/stream`);
      const streamRes = await fetch(streamUrl, { signal: abortRef.current.signal });
      if (!streamRes.ok || !streamRes.body) throw new Error("Stream failed");

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;
          try {
            const evt = JSON.parse(raw) as { type?: string; content?: string; delta?: string };
            const text = evt.delta ?? evt.content ?? "";
            if (text) { full += text; setResponse(full); }
          } catch { /* ignore malformed */ }
        }
      }

      const elapsed = Date.now() - startMs;
      setLatencyMs(elapsed);

      // Store history
      const entry: HistoryEntry = {
        id: uid(),
        prompt: p,
        response: full,
        config: { ...config },
        timestamp: Date.now(),
        latencyMs: elapsed,
      };
      const updated = [entry, ...history].slice(0, 10);
      setHistory(updated);
      saveHistory(updated);

      // Clean up temp session
      await fetchApi(`/api/sessions/${session.id}`, { method: "DELETE" }).catch(() => {});

    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error("Run failed");
        setResponse("");
      }
    } finally {
      setRunning(false);
    }
  }, [prompt, running, config, history]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void run();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [run]);

  const copyResponse = () => {
    void navigator.clipboard.writeText(response);
    toast("Copied");
  };

  const saveSnippet = () => {
    if (!response) return;
    try {
      const snippets = JSON.parse(localStorage.getItem(SNIPPETS_KEY) ?? "[]") as Array<{ id: string; content: string; createdAt: number }>;
      snippets.unshift({ id: uid(), content: response, createdAt: Date.now() });
      localStorage.setItem(SNIPPETS_KEY, JSON.stringify(snippets.slice(0, 50)));
      toast("Saved to snippets");
    } catch { toast.error("Failed to save snippet"); }
  };

  const newSessionWithThis = async () => {
    if (!prompt.trim() || !response) return;
    try {
      const session = await fetchApi<Session>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: prompt.slice(0, 50),
          model: config.model,
          system_prompt: config.systemPrompt || undefined,
        }),
      });
      await fetchApi(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ role: "user", content: prompt }),
      });
      await fetchApi(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ role: "assistant", content: response }),
      });
      window.dispatchEvent(new CustomEvent("hm-open-session", { detail: session.id }));
      toast("Session created");
    } catch { toast.error("Failed to create session"); }
  };

  const restoreHistory = (entry: HistoryEntry) => {
    setPrompt(entry.prompt);
    setConfig(entry.config);
    setResponse(entry.response);
    setLatencyMs(entry.latencyMs);
  };

  const addPreset = (preset: Preset) => {
    const updated = [preset, ...presets];
    setPresets(updated);
    savePresets(updated);
    setShowSavePreset(false);
  };

  const loadPreset = (preset: Preset) => {
    setConfig(preset.config);
  };

  const inputStyle: React.CSSProperties = {
    fontSize: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)",
    borderRadius: 4, padding: "5px 8px", color: "var(--text)",
    outline: "none", fontFamily: "var(--font-sans)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
    letterSpacing: "0.06em", fontWeight: 600, marginBottom: 3, display: "block",
  };

  const tokenCount = approxTokens((config.systemPrompt || "") + prompt + response);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Left config panel ── */}
      <div style={{
        width: 240, flexShrink: 0, borderRight: "1px solid var(--border)",
        overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 14,
        background: "var(--bg-panel)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", paddingBottom: 4, borderBottom: "1px solid var(--border)" }}>
          Configuration
        </div>

        {/* Model */}
        <div>
          <label style={labelStyle}>Model</label>
          <select
            value={config.model}
            onChange={e => updateConfig("model", e.target.value as Model)}
            style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
          >
            {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Temperature */}
        <div>
          <label style={labelStyle}>Temperature: {config.temperature.toFixed(1)}</label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={config.temperature}
            onChange={e => updateConfig("temperature", parseFloat(e.target.value))}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
            <span>0</span><span>1</span><span>2</span>
          </div>
        </div>

        {/* Max tokens */}
        <div>
          <label style={labelStyle}>Max tokens</label>
          <input
            type="number"
            min={1}
            max={32000}
            step={256}
            value={config.maxTokens}
            onChange={e => updateConfig("maxTokens", parseInt(e.target.value, 10) || 1024)}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          />
        </div>

        {/* System prompt */}
        <div>
          <button
            onClick={() => setSystemOpen(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 4 }}
          >
            <span style={{ ...labelStyle, margin: 0 }}>System prompt</span>
            <span style={{ fontSize: 9, color: "var(--text-muted)", transform: systemOpen ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 120ms" }}>▸</span>
          </button>
          {systemOpen && (
            <textarea
              value={config.systemPrompt}
              onChange={e => updateConfig("systemPrompt", e.target.value)}
              rows={5}
              placeholder="Optional system prompt..."
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
            />
          )}
        </div>

        {/* Presets */}
        <div>
          <label style={labelStyle}>Presets</label>
          {presets.length > 0 && (
            <select
              onChange={e => {
                const p = presets.find(x => x.id === e.target.value);
                if (p) loadPreset(p);
              }}
              defaultValue=""
              style={{ ...inputStyle, width: "100%", cursor: "pointer", marginBottom: 6 }}
            >
              <option value="" disabled>Load preset...</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setShowSavePreset(true)}
            style={{ fontSize: 11, padding: "4px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--text)", fontFamily: "var(--font-sans)", width: "100%" }}
          >Save as agent preset</button>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Prompt area */}
        <div style={{ padding: 12, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ ...labelStyle, margin: 0, flex: 1 }}>Prompt</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>⌘↵ to run</span>
          </div>
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={5}
            placeholder="Enter your prompt..."
            style={{
              width: "100%", boxSizing: "border-box", fontSize: 13,
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "8px 10px", color: "var(--text)",
              outline: "none", fontFamily: "var(--font-sans)", resize: "vertical",
              lineHeight: 1.6,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              onClick={() => void run()}
              disabled={running || !prompt.trim()}
              style={{
                padding: "6px 20px", fontSize: 12, fontWeight: 600,
                background: running || !prompt.trim() ? "var(--bg-elevated)" : "var(--accent)",
                border: "none", borderRadius: 6, cursor: running || !prompt.trim() ? "not-allowed" : "pointer",
                color: running || !prompt.trim() ? "var(--text-muted)" : "#fff",
                fontFamily: "var(--font-sans)", transition: "background 120ms",
              }}
            >{running ? "Running..." : "Run"}</button>
          </div>
        </div>

        {/* Response area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Metadata strip */}
          {(latencyMs !== null || response) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "4px 12px", borderBottom: "1px solid var(--border)",
              fontSize: 11, color: "var(--text-muted)", background: "var(--bg-elevated)", flexShrink: 0,
            }}>
              {latencyMs !== null && <span>Latency: {fmtMs(latencyMs)}</span>}
              {response && <span>~{approxTokens(response)} tokens</span>}
              {response && <span>Total context: ~{tokenCount} tokens</span>}
              <div style={{ flex: 1 }} />
              {response && (
                <>
                  <button onClick={copyResponse} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 11, padding: "1px 4px", fontFamily: "var(--font-sans)" }}>Copy</button>
                  <button onClick={saveSnippet} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 11, padding: "1px 4px", fontFamily: "var(--font-sans)" }}>Save snippet</button>
                  <button onClick={() => void newSessionWithThis()} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 11, padding: "1px 4px", fontFamily: "var(--font-sans)" }}>New session</button>
                </>
              )}
            </div>
          )}

          {/* Response text */}
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {response ? (
              <pre style={{
                margin: 0, fontSize: 12, color: "var(--text)", lineHeight: 1.7,
                whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--font-mono, monospace)",
              }}>{response}</pre>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 40 }}>
                {running ? "Waiting for response..." : "Response will appear here"}
              </div>
            )}
          </div>

          {/* History */}
          <div style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}>
            <button
              onClick={() => setHistoryOpen(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%",
                padding: "6px 12px", background: "none", border: "none",
                cursor: "pointer", color: "var(--text-muted)", fontSize: 11,
                fontFamily: "var(--font-sans)",
              }}
            >
              <span style={{ transform: historyOpen ? "rotate(90deg)" : "none", transition: "transform 120ms", fontSize: 9, opacity: 0.5 }}>▸</span>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10, fontWeight: 600, opacity: 0.6 }}>
                History ({history.length})
              </span>
            </button>
            {historyOpen && history.length > 0 && (
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {history.map(entry => (
                  <div
                    key={entry.id}
                    onClick={() => restoreHistory(entry)}
                    style={{
                      padding: "6px 12px", cursor: "pointer",
                      borderTop: "1px solid var(--border)",
                      display: "flex", flexDirection: "column", gap: 2,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.prompt.slice(0, 60)}{entry.prompt.length > 60 ? "..." : ""}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{fmtMs(entry.latencyMs)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {entry.config.model} · {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSavePreset && (
        <SavePresetDialog
          config={config}
          onSave={addPreset}
          onClose={() => setShowSavePreset(false)}
        />
      )}
    </div>
  );
}
