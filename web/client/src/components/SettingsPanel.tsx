import { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";

interface CliStatus { installed: boolean; version?: string; authed?: boolean; }
interface DetectResult { claude: CliStatus; gemini: CliStatus; codex: CliStatus; gh: CliStatus; }
interface ProviderConfig { id: string; name: string; apiKey?: string; baseUrl?: string; enabled: boolean; }
interface ProvidersStore { active: string; model: string; providers: ProviderConfig[]; }

const CLI_PROVIDERS = [
  { id: "claude", name: "Claude", key: "claude" as keyof DetectResult, description: "Anthropic Claude via Claude Code", installCmd: "npm install -g @anthropic-ai/claude-code", authCmd: "claude auth login" },
  { id: "gemini", name: "Gemini", key: "gemini" as keyof DetectResult, description: "Google Gemini via Gemini CLI", installCmd: "npm install -g @google/gemini-cli", authCmd: "gemini auth" },
  { id: "codex", name: "Codex / OpenAI", key: "codex" as keyof DetectResult, description: "OpenAI via Codex CLI", installCmd: "npm install -g @openai/codex", authCmd: "export OPENAI_API_KEY=sk-..." },
  { id: "gh", name: "GitHub Copilot", key: "gh" as keyof DetectResult, description: "GitHub Copilot via gh CLI", installCmd: "brew install gh", authCmd: "gh auth login" },
];

const API_PROVIDERS = [
  { id: "anthropic",  name: "Anthropic",          placeholder: "ANTHROPIC_API_KEY" },
  { id: "openai",     name: "OpenAI",              placeholder: "OPENAI_API_KEY" },
  { id: "google",     name: "Google Gemini",       placeholder: "GOOGLE_AI_API_KEY" },
  { id: "groq",       name: "Groq",                placeholder: "GROQ_API_KEY" },
  { id: "deepseek",   name: "DeepSeek",            placeholder: "DEEPSEEK_API_KEY" },
  { id: "mistral",    name: "Mistral",             placeholder: "MISTRAL_API_KEY" },
  { id: "grok",       name: "xAI Grok",            placeholder: "XAI_API_KEY" },
  { id: "openrouter", name: "OpenRouter",          placeholder: "OPENROUTER_API_KEY" },
  { id: "together",   name: "Together AI",         placeholder: "TOGETHER_API_KEY" },
  { id: "fireworks",  name: "Fireworks",           placeholder: "FIREWORKS_API_KEY" },
  { id: "vercel",     name: "Vercel AI Gateway",   placeholder: "VERCEL_API_TOKEN" },
  { id: "302ai",      name: "302.AI",              placeholder: "302AI_API_KEY" },
];

const QUICK_MODELS = ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "gemini-2.5-pro", "gpt-4o"];

function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      width: "100%", padding: "10px 0", cursor: "pointer",
      background: "none", border: "none", borderBottom: "1px solid var(--border)",
      fontSize: 11, fontWeight: 600, color: "var(--text-dim)",
      textTransform: "uppercase", letterSpacing: "0.06em",
      marginBottom: open ? 12 : 0,
    }}>
      {label}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms", flexShrink: 0 }}>
        <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

export function SettingsPanel({ onClose: _onClose }: { onClose: () => void }) {
  const [detect, setDetect] = useState<DetectResult | null>(null);
  const [store, setStore] = useState<ProvidersStore | null>(null);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<Record<string, boolean>>({ cli: true, apikeys: false, model: false, advanced: false });
  const [testStatus, setTestStatus] = useState<Record<string, "testing" | "ok" | "fail">>({});

  useEffect(() => {
    fetchApi<DetectResult>("/api/providers/detect").then(setDetect).catch(() => {});
    fetchApi<ProvidersStore>("/api/providers").then(d => {
      setStore(d);
      const hasAnyKey = d.providers.some(p => p.apiKey);
      if (hasAnyKey) setSections(prev => ({ ...prev, apikeys: true }));
    }).catch(() => {});
  }, []);

  const toggleSection = (key: string) => setSections(prev => ({ ...prev, [key]: !prev[key] }));

  const refresh = () => {
    setDetect(null);
    fetchApi<DetectResult>("/api/providers/detect").then(setDetect).catch(() => {});
  };

  const setActive = async (id: string) => {
    if (!store) return;
    setSaving(true);
    try {
      const result = await fetchApi<ProvidersStore>("/api/providers", { method: "PUT", body: JSON.stringify({ ...store, active: id }) });
      setStore(result);
      toast.success(`Active provider: ${id}`);
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const saveModel = async (model: string) => {
    if (!store) return;
    try {
      const result = await fetchApi<ProvidersStore>("/api/providers", { method: "PUT", body: JSON.stringify({ ...store, model }) });
      setStore(result);
      toast.success("Saved");
    } catch { toast.error("Failed to save"); }
  };

  const copyCmd = (cmd: string) => {
    void navigator.clipboard.writeText(cmd);
    toast.success("Copied");
  };

  const saveProviders = async (updated: ProvidersStore) => {
    try { await fetchApi("/api/providers", { method: "PUT", body: JSON.stringify(updated) }); }
    catch { toast.error("Failed to save"); }
  };

  const updateKey = (id: string, val: string) => {
    if (!store) return;
    const exists = store.providers.find(p => p.id === id);
    const providers = exists
      ? store.providers.map(p => p.id === id ? { ...p, apiKey: val, enabled: !!val } : p)
      : [...store.providers, { id, name: id, apiKey: val, enabled: !!val }];
    setStore({ ...store, providers });
  };

  const toggleEnabled = (id: string) => {
    if (!store) return;
    const updated = { ...store, providers: store.providers.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p) };
    setStore(updated);
    void saveProviders(updated);
  };

  const getProvider = (id: string) => store?.providers.find(p => p.id === id);

  const testProvider = async (id: string) => {
    setTestStatus(prev => ({ ...prev, [id]: "testing" }));
    try {
      const res = await fetchApi<{ ok: boolean; error?: string }>(`/api/providers/${id}/test`, { method: "POST" });
      setTestStatus(prev => ({ ...prev, [id]: res.ok ? "ok" : "fail" }));
      if (!res.ok) toast.error(`${id}: ${res.error ?? "Auth failed"}`);
    } catch {
      setTestStatus(prev => ({ ...prev, [id]: "fail" }));
    }
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 0 }}>

      {/* CLI Providers */}
      <SectionHeader label="CLI Providers" open={sections.cli} onToggle={() => toggleSection("cli")} />
      {sections.cli && (
        <div style={{ paddingBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Install a CLI, authenticate once — no API keys needed.</span>
            <button className="btn btn-ghost-accent btn-sm" onClick={refresh}>↻ Refresh</button>
          </div>
          {CLI_PROVIDERS.map(p => {
            const status = detect?.[p.key];
            const isActive = store?.active === p.id;
            const ready = status?.installed && status.authed;
            const dotClass = !status ? "dot dot-muted" : !status.installed ? "dot dot-red" : !status.authed ? "dot dot-yellow" : "dot dot-green";
            const statusText = !status ? "Checking..." : !status.installed ? "Not installed" : !status.authed ? "Not authenticated" : "Ready";
            return (
              <div key={p.id} className={`card${isActive ? " card-active" : ""}`}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                  <span className={dotClass} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
                      {status?.version && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{status.version}</span>}
                      {isActive && (
                        <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>ACTIVE</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                      {statusText} — {p.description}
                    </div>
                  </div>
                  {!isActive && ready && (
                    <button className="btn btn-primary btn-sm" onClick={() => void setActive(p.id)} disabled={saving}>Set active</button>
                  )}
                  {status?.installed && !status.authed && (
                    <button className="btn btn-warn btn-sm" onClick={() => copyCmd(p.authCmd)}>Copy auth cmd</button>
                  )}
                  {status && !status.installed && (
                    <button className="btn btn-secondary btn-sm" onClick={() => copyCmd(p.installCmd)}>Copy install cmd</button>
                  )}
                </div>
                {status && (!status.installed || !status.authed) && (
                  <div className="card-footer" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <code style={{ fontSize: 11, color: "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>
                      {!status.installed ? p.installCmd : p.authCmd}
                    </code>
                    <button className="btn btn-ghost btn-xs" onClick={() => copyCmd(!status.installed ? p.installCmd : p.authCmd)}
                      style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      Copy
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* API Keys */}
      <SectionHeader label="API Keys" open={sections.apikeys} onToggle={() => toggleSection("apikeys")} />
      {sections.apikeys && (
        <div style={{ paddingBottom: 16, display: "flex", flexDirection: "column" }}>
          {API_PROVIDERS.map(p => {
            const provider = getProvider(p.id);
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 12, color: "var(--text-dim)", width: 110, flexShrink: 0 }}>{p.name}</span>
                <input
                  type="password"
                  value={provider?.apiKey ?? ""}
                  placeholder={p.placeholder}
                  onChange={e => updateKey(p.id, e.target.value)}
                  onBlur={() => { if (store) void saveProviders(store); }}
                  className="input input-mono"
                />
                {provider?.apiKey && (
                  <button
                    onClick={() => void testProvider(p.id)}
                    disabled={testStatus[p.id] === "testing"}
                    style={{
                      fontSize: 10, padding: "2px 7px", background: "none", cursor: "pointer", flexShrink: 0,
                      border: `1px solid ${testStatus[p.id] === "ok" ? "var(--green)" : testStatus[p.id] === "fail" ? "var(--red)" : "var(--border)"}`,
                      borderRadius: 3,
                      color: testStatus[p.id] === "ok" ? "var(--green)" : testStatus[p.id] === "fail" ? "var(--red)" : "var(--text-muted)",
                    }}
                  >
                    {testStatus[p.id] === "testing" ? "..." : testStatus[p.id] === "ok" ? "✓" : testStatus[p.id] === "fail" ? "✗" : "Test"}
                  </button>
                )}
                <button
                  className={`toggle${provider?.enabled ? " on" : ""}`}
                  onClick={() => toggleEnabled(p.id)}
                  title={provider?.enabled ? "Enabled" : "Disabled"}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Default Model */}
      <SectionHeader label="Default Model" open={sections.model} onToggle={() => toggleSection("model")} />
      {sections.model && store && (
        <div style={{ paddingBottom: 16 }}>
          <input
            defaultValue={store.model}
            onBlur={e => void saveModel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void saveModel((e.target as HTMLInputElement).value); }}
            className="input"
            style={{ padding: "7px 10px" }}
            placeholder="claude-sonnet-4-6"
          />
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>
            {QUICK_MODELS.map(m => (
              <button key={m} className="btn btn-secondary btn-xs" onClick={() => void saveModel(m)}>{m}</button>
            ))}
          </div>
        </div>
      )}

      {/* Advanced */}
      <SectionHeader label="Advanced" open={sections.advanced} onToggle={() => toggleSection("advanced")} />
      {sections.advanced && store && (
        <div style={{ paddingBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Base URL overrides for custom endpoints.</div>
          {store.providers.map(p => (
            <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>{p.name}</div>
              <input
                type="text"
                defaultValue={p.baseUrl ?? ""}
                placeholder="Base URL (optional)"
                onBlur={async e => {
                  const updated = { ...store, providers: store.providers.map(pr => pr.id === p.id ? { ...pr, baseUrl: e.target.value || undefined } : pr) };
                  try { await fetchApi("/api/providers", { method: "PUT", body: JSON.stringify(updated) }); toast.success("Saved"); }
                  catch { toast.error("Failed"); }
                }}
                className="input input-mono"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
