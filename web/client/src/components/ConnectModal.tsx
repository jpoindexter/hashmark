import { useState, useEffect, useRef } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";

interface CliStatus { installed: boolean; version?: string; authed?: boolean; }
interface DetectResult { claude: CliStatus; gemini: CliStatus; codex: CliStatus; gh: CliStatus; }
interface ProviderConfig { id: string; name: string; apiKey?: string; baseUrl?: string; enabled: boolean; }
interface ProvidersStore { active: string; model: string; providers: ProviderConfig[]; }

const CLI_PROVIDERS = [
  { id: "claude",  name: "Claude Code",      key: "claude" as keyof DetectResult, icon: "◆", installCmd: "npm install -g @anthropic-ai/claude-code", authCmd: "claude auth login",     docsUrl: "https://claude.ai/code" },
  { id: "gemini",  name: "Gemini CLI",       key: "gemini" as keyof DetectResult, icon: "◈", installCmd: "npm install -g @google/gemini-cli",        authCmd: "gemini auth",           docsUrl: "https://github.com/google-gemini/gemini-cli" },
  { id: "codex",   name: "Codex / OpenAI",   key: "codex"  as keyof DetectResult, icon: "◉", installCmd: "npm install -g @openai/codex",             authCmd: "export OPENAI_API_KEY=sk-...", docsUrl: "https://github.com/openai/codex" },
  { id: "gh",      name: "GitHub Copilot",   key: "gh"     as keyof DetectResult, icon: "◎", installCmd: "brew install gh",                          authCmd: "gh auth login",         docsUrl: "https://github.com/cli/cli" },
];

const API_PROVIDERS = [
  { id: "anthropic",  name: "Anthropic",         placeholder: "sk-ant-...",       category: "Frontier" },
  { id: "openai",     name: "OpenAI",             placeholder: "sk-...",           category: "Frontier" },
  { id: "google",     name: "Google Gemini",      placeholder: "AIza...",          category: "Frontier" },
  { id: "mistral",    name: "Mistral",            placeholder: "...",              category: "Frontier" },
  { id: "grok",       name: "xAI Grok",           placeholder: "xai-...",          category: "Frontier" },
  { id: "groq",       name: "Groq",               placeholder: "gsk_...",          category: "Fast" },
  { id: "deepseek",   name: "DeepSeek",           placeholder: "sk-...",           category: "Fast" },
  { id: "together",   name: "Together AI",        placeholder: "...",              category: "Aggregator" },
  { id: "fireworks",  name: "Fireworks",          placeholder: "fw-...",           category: "Aggregator" },
  { id: "openrouter", name: "OpenRouter",         placeholder: "sk-or-...",        category: "Aggregator" },
  { id: "vercel",     name: "Vercel AI Gateway",  placeholder: "VERCEL_API_TOKEN", category: "Aggregator" },
  { id: "302ai",      name: "302.AI",             placeholder: "...",              category: "Aggregator" },
  { id: "ollama",     name: "Ollama (local)",     placeholder: "not required",     category: "Local" },
];

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [detect, setDetect] = useState<DetectResult | null>(null);
  const [store, setStore] = useState<ProvidersStore | null>(null);
  const [activeTab, setActiveTab] = useState<"cli" | "api">("cli");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    fetchApi<DetectResult>("/api/providers/detect").then(setDetect).catch(() => {});
    fetchApi<ProvidersStore>("/api/providers").then(setStore).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const q = search.toLowerCase();
  const filteredCli = CLI_PROVIDERS.filter(p => p.name.toLowerCase().includes(q));
  const filteredApi = API_PROVIDERS.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));

  const copyCmd = (cmd: string) => { void navigator.clipboard.writeText(cmd); toast.success("Copied"); };

  const getProviderCfg = (id: string) => store?.providers.find(p => p.id === id);

  const connectApi = async (id: string, key: string) => {
    if (!store || !key.trim()) return;
    setSaving(true);
    try {
      const exists = store.providers.find(p => p.id === id);
      const providers = exists
        ? store.providers.map(p => p.id === id ? { ...p, apiKey: key.trim(), enabled: true } : p)
        : [...store.providers, { id, name: id, apiKey: key.trim(), enabled: true }];
      const updated = { ...store, providers };
      const saved = await fetchApi<ProvidersStore>("/api/providers", { method: "PUT", body: JSON.stringify(updated) });
      setStore(saved);
      toast.success(`${id} connected`);
      setSelectedId(null);
      setKeyInput("");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const setActive = async (id: string) => {
    if (!store) return;
    setSaving(true);
    try {
      const saved = await fetchApi<ProvidersStore>("/api/providers", { method: "PUT", body: JSON.stringify({ ...store, active: id }) });
      setStore(saved);
      toast.success(`Active provider: ${id}`);
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const selectProvider = (id: string) => {
    if (selectedId === id) { setSelectedId(null); setKeyInput(""); return; }
    setSelectedId(id);
    setKeyInput(getProviderCfg(id)?.apiKey ?? "");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cliStatuses: Record<string, CliStatus | undefined> = detect
    ? { claude: detect.claude, gemini: detect.gemini, codex: detect.codex, gh: detect.gh }
    : {};

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--overlay-bg)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 580, maxHeight: "80vh", display: "flex", flexDirection: "column",
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        animation: "gc-fade-in 0.2s cubic-bezier(0.16,1,0.3,1) both",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Connect Provider</span>
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search providers..."
            style={{
              width: "100%", background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "7px 10px", fontSize: 12,
              color: "var(--text)", outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginTop: 10, borderBottom: "1px solid var(--border)" }}>
            {(["cli", "api"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: "6px 14px", fontSize: 11, fontWeight: 600,
                background: "none", border: "none", cursor: "pointer",
                color: activeTab === tab ? "var(--text)" : "var(--text-muted)",
                borderBottom: `2px solid ${activeTab === tab ? "var(--accent)" : "transparent"}`,
                textTransform: "uppercase", letterSpacing: "0.05em",
                transition: "color 100ms",
              }}>
                {tab === "cli" ? "CLI Providers" : "API Keys"}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
          {activeTab === "cli" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredCli.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>No CLI providers match</div>
              )}
              {filteredCli.map(p => {
                const status = cliStatuses[p.id];
                const ready = status?.installed && status.authed;
                const isActive = store?.active === p.id;
                const dotColor = !status ? "var(--border)"
                  : !status.installed ? "var(--red)"
                  : !status.authed ? "var(--yellow)"
                  : "var(--green)";
                const statusText = !status ? "Checking..."
                  : !status.installed ? "Not installed"
                  : !status.authed ? "Not authenticated"
                  : `Ready${status.version ? ` · ${status.version}` : ""}`;

                return (
                  <div key={p.id} style={{
                    background: "var(--bg-elevated)", borderRadius: "var(--radius-md)",
                    border: `1px solid ${isActive ? "var(--accent-dim)" : "var(--border)"}`,
                    overflow: "hidden",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                      <span style={{ fontSize: 16, color: "var(--text-dim)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>{p.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
                          {isActive && <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>ACTIVE</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{statusText}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        {ready && !isActive && (
                          <button className="btn btn-primary btn-sm" onClick={() => void setActive(p.id)} disabled={saving}>Set active</button>
                        )}
                        {status && !status.installed && (
                          <button className="btn btn-secondary btn-sm" onClick={() => copyCmd(p.installCmd)}>Copy install</button>
                        )}
                        {status?.installed && !status.authed && (
                          <button className="btn btn-warn btn-sm" onClick={() => copyCmd(p.authCmd)}>Copy auth</button>
                        )}
                      </div>
                    </div>
                    {/* Install / auth command */}
                    {status && (!status.installed || !status.authed) && (
                      <div style={{ borderTop: "1px solid var(--border)", padding: "6px 12px", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8 }}>
                        <code style={{ fontSize: 11, color: "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>
                          {!status.installed ? p.installCmd : p.authCmd}
                        </code>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "api" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredApi.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>No providers match</div>
              )}
              {/* Group by category */}
              {(["Frontier", "Fast", "Aggregator", "Local"] as const).map(cat => {
                const items = filteredApi.filter(p => p.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", padding: "6px 0 4px" }}>{cat}</div>
                    {items.map(p => {
                      const cfg = getProviderCfg(p.id);
                      const hasKey = !!cfg?.apiKey;
                      const isSelected = selectedId === p.id;
                      return (
                        <div key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <div
                            onClick={() => selectProvider(p.id)}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", cursor: "pointer" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <span style={{ fontSize: 12, color: "var(--text-dim)", flex: 1 }}>{p.name}</span>
                            {hasKey && (
                              <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 600, textTransform: "uppercase" }}>Connected</span>
                            )}
                            {cfg?.enabled && (
                              <span style={{ fontSize: 10, color: "var(--accent)" }}>Enabled</span>
                            )}
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{isSelected ? "▴" : "▾"}</span>
                          </div>
                          {isSelected && (
                            <div style={{ padding: "8px 4px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <input
                                  ref={inputRef}
                                  type="password"
                                  value={keyInput}
                                  onChange={e => setKeyInput(e.target.value)}
                                  placeholder={p.placeholder}
                                  onKeyDown={e => { if (e.key === "Enter") void connectApi(p.id, keyInput); }}
                                  style={{
                                    flex: 1, padding: "6px 9px", background: "var(--bg-elevated)",
                                    border: "1px solid var(--border-focus)", borderRadius: "var(--radius-sm)",
                                    fontSize: 12, color: "var(--text)", outline: "none",
                                    fontFamily: "var(--font-mono)",
                                  }}
                                />
                                <button
                                  className={`btn btn-md ${keyInput.trim() ? "btn-primary" : "btn-secondary"}`}
                                  onClick={() => void connectApi(p.id, keyInput)}
                                  disabled={saving || !keyInput.trim()}
                                >
                                  {hasKey ? "Update" : "Connect"}
                                </button>
                              </div>
                              {p.id === "ollama" && (
                                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                  Ollama runs locally — no key needed. Just enter any value to enable.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Keys stored in .hashmark/providers.json</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
