import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Skeleton, SkeletonCard } from "../components/shared/Skeleton.tsx";

interface InfoData {
  projectName: string;
  projectDir: string;
  nodeVersion?: string;
  port?: number;
}
interface DetectedCLI {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  path?: string;
}
interface McpServer {
  command: string;
  source: string;
}
interface McpConfigData {
  sources: Array<{ path: string; exists: boolean; serverCount: number; label: string }>;
  servers: Record<string, McpServer>;
}
interface EnvVar {
  key: string;
  source: string;
}
interface ProviderInfo {
  id: string;
  name: string;
  enabled: boolean;
  hasKey: boolean;
  cliDetected: boolean;
  baseUrl?: string;
}
interface ProvidersData {
  active: string;
  model: string;
  providers: ProviderInfo[];
}
interface ScanConfig {
  formats: string[];
  maxTokens: number;
  watchDebounceMs: number;
  autoRescan: boolean;
}

const SECTIONS = [
  { id: "appearance",   label: "Appearance",   group: "Studio" },
  { id: "chat",         label: "Chat",         group: "Studio" },
  { id: "project",      label: "Project",      group: "Workspace" },
  { id: "git",          label: "Git",          group: "Workspace" },
  { id: "env",          label: "Environment",  group: "Workspace" },
  { id: "workspace",    label: "Workspace",    group: "Workspace" },
  { id: "providers",    label: "Providers",    group: "AI" },
  { id: "scan",         label: "Scan",         group: "AI" },
  { id: "claude-code",  label: "Claude Code",  group: "Integrations" },
  { id: "mcp",          label: "MCP Servers",  group: "Integrations" },
  { id: "api-keys",     label: "API Keys",     group: "Integrations" },
  { id: "studio",       label: "About Studio", group: "System" },
  { id: "experimental", label: "Experimental", group: "System" },
];

const GROUPS = Array.from(new Set(SECTIONS.map(s => s.group)));

const PROVIDER_ICONS: Record<string, string> = {
  claude:  "✸",
  openai:  "◎",
  gemini:  "◈",
  mistral: "◇",
  grok:    "✦",
  ollama:  "◉",
  codex:   "⬡",
};

const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai:  "OPENAI_API_KEY",
  gemini:  "GOOGLE_AI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  grok:    "XAI_API_KEY",
  codex:   "OPENAI_API_KEY",
};

const ALL_FORMATS = [
  { id: "CLAUDE.md",             label: "CLAUDE.md",             desc: "Anthropic Claude Code" },
  { id: "AGENTS.md",             label: "AGENTS.md",             desc: "OpenAI Agents / general" },
  { id: ".cursorrules",          label: ".cursorrules",          desc: "Cursor IDE" },
  { id: "openai-system-prompt",  label: "openai-system-prompt",  desc: "ChatGPT system prompt" },
  { id: "json",                  label: "JSON",                  desc: "Machine-readable output" },
];

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio:${key}`, JSON.stringify(val)); } catch {}
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function dispatch(key: string, value: unknown) {
  window.dispatchEvent(new CustomEvent("studio:settings-change", { detail: { key, value } }));
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 32, height: 18, borderRadius: 9, border: "none", cursor: "pointer",
        background: checked ? "var(--accent)" : "var(--bg-4)",
        position: "relative", transition: "background 0.15s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: checked ? 16 : 2,
        width: 14, height: 14, borderRadius: "50%", background: "var(--text)",
        transition: "left 0.15s",
      }} />
    </button>
  );
}

function ProviderPanel({ envVars }: { envVars: EnvVar[] }) {
  const [data, setData] = useState<ProvidersData | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [baseUrlInputs, setBaseUrlInputs] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [testStatus, setTestStatus] = useState<Record<string, "idle" | "testing" | "ok" | "fail">>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/providers")
      .then(r => r.json())
      .then((d: ProvidersData) => setData(d))
      .catch(() => {});
  }, []);

  function loadModels(id: string) {
    if (models[id]) return;
    fetch(`/api/providers/models/${id}`)
      .then(r => r.json())
      .then((d: { models: string[] }) => setModels(prev => ({ ...prev, [id]: d.models ?? [] })))
      .catch(() => {});
  }

  function toggleExpand(id: string) {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next) loadModels(next);
  }

  async function saveKey(providerId: string) {
    const key = keyInputs[providerId] ?? "";
    setSaving(providerId);
    try {
      await fetch(`/api/providers/${providerId}/key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          providers: prev.providers.map(p =>
            p.id === providerId ? { ...p, hasKey: key.length > 0, enabled: key.length > 0 } : p
          ),
        };
      });
      setKeyInputs(prev => ({ ...prev, [providerId]: "" }));
    } finally {
      setSaving(null);
    }
  }

  async function saveBaseUrl(providerId: string) {
    const url = baseUrlInputs[providerId] ?? "";
    if (!url) return;
    setSaving(providerId);
    try {
      await fetch(`/api/providers/${providerId}/baseUrl`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: url }),
      });
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          providers: prev.providers.map(p =>
            p.id === providerId ? { ...p, baseUrl: url } : p
          ),
        };
      });
    } finally {
      setSaving(null);
    }
  }

  async function setActive(providerId: string, model?: string) {
    if (!data) return;
    const provModels = models[providerId] ?? [];
    const chosenModel = model ?? provModels[0] ?? data.model;
    await fetch("/api/providers/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId, model: chosenModel }),
    });
    setData(prev => prev ? { ...prev, active: providerId, model: chosenModel } : prev);
  }

  async function testConnection(providerId: string) {
    setTestStatus(prev => ({ ...prev, [providerId]: "testing" }));
    try {
      const res = await fetch(`/api/providers/models/${providerId}`);
      const d = await res.json() as { models?: string[]; error?: string };
      if (d.models && d.models.length > 0) {
        setModels(prev => ({ ...prev, [providerId]: d.models! }));
        setTestStatus(prev => ({ ...prev, [providerId]: "ok" }));
      } else {
        setTestStatus(prev => ({ ...prev, [providerId]: "fail" }));
      }
    } catch {
      setTestStatus(prev => ({ ...prev, [providerId]: "fail" }));
    }
    setTimeout(() => setTestStatus(prev => ({ ...prev, [providerId]: "idle" })), 3000);
  }

  if (!data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[1, 2, 3].map(i => (
          <SkeletonCard key={i} height={48} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.providers.map(provider => {
        const isExpanded = expanded === provider.id;
        const isActive = data.active === provider.id;
        const needsKey = provider.id !== "claude" && provider.id !== "ollama";
        const hasEnvKey = envVars.some(v => v.key === PROVIDER_ENV_KEYS[provider.id]);
        const effectivelyHasKey = provider.hasKey || hasEnvKey || provider.cliDetected || provider.id === "claude" || provider.id === "ollama";
        const icon = PROVIDER_ICONS[provider.id] ?? "◎";
        const ts = testStatus[provider.id] ?? "idle";
        const provModels = models[provider.id] ?? [];

        return (
          <div
            key={provider.id}
            style={{
              background: "var(--bg-2)",
              border: `1px solid ${isActive ? "var(--accent-border)" : "var(--border-dim)"}`,
              borderRadius: "var(--radius)",
              overflow: "hidden",
              transition: "border-color 0.15s",
            }}
          >
            <div
              onClick={() => toggleExpand(provider.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                cursor: "pointer",
                background: isActive ? "var(--accent-bg)" : "transparent",
              }}
            >
              <span style={{ fontSize: 14, color: isActive ? "var(--accent)" : "var(--text-dimmer)", flexShrink: 0 }}>
                {icon}
              </span>
              <span style={{
                flex: 1, fontSize: 13, fontWeight: 500,
                color: isActive ? "var(--accent)" : "var(--text)",
              }}>
                {provider.name}
              </span>
              {isActive && (
                <span style={{
                  fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em",
                  color: "var(--accent)", background: "var(--accent-bg)",
                  border: "1px solid var(--accent-border)", borderRadius: 3,
                  padding: "1px 6px", flexShrink: 0,
                }}>
                  active
                </span>
              )}
              {provider.cliDetected && !isActive && (
                <span style={{ fontSize: 9, color: "var(--accent)", opacity: 0.8, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 10 }}>&#x2713;</span> CLI detected
                </span>
              )}
              {effectivelyHasKey && !provider.cliDetected && !isActive && (
                <span style={{ fontSize: 9, color: "var(--accent)", opacity: 0.6, flexShrink: 0 }}>key set</span>
              )}
              {needsKey && !effectivelyHasKey && (
                <span style={{ fontSize: 9, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
                  no key
                </span>
              )}
              <span style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0, marginLeft: 4 }}>
                {isExpanded ? "▲" : "▼"}
              </span>
            </div>

            {isExpanded && (
              <div style={{ borderTop: "1px solid var(--border-dim)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

                {needsKey && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                      API Key
                      {PROVIDER_ENV_KEYS[provider.id] && (
                        <span style={{ marginLeft: 6, opacity: 0.6 }}>
                          (or set <code style={{ color: "var(--accent)", fontFamily: "var(--font)" }}>{PROVIDER_ENV_KEYS[provider.id]}</code> in .env)
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <div style={{ flex: 1, position: "relative" }}>
                        <input
                          type={showKeys[provider.id] ? "text" : "password"}
                          value={keyInputs[provider.id] ?? ""}
                          onChange={e => setKeyInputs(prev => ({ ...prev, [provider.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") void saveKey(provider.id); }}
                          placeholder={provider.hasKey ? "••••••••••••••••" : "sk-..."}
                          style={{
                            width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)",
                            borderRadius: "var(--radius)", color: "var(--text)", fontSize: 11,
                            fontFamily: "var(--font)", padding: "5px 32px 5px 8px", outline: "none",
                          }}
                        />
                        <button
                          onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                          style={{
                            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: 11, color: "var(--text-dimmer)", padding: 2,
                          }}
                          title={showKeys[provider.id] ? "Hide" : "Show"}
                        >
                          {showKeys[provider.id] ? "◉" : "○"}
                        </button>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => void saveKey(provider.id)}
                        disabled={saving === provider.id || !(keyInputs[provider.id] ?? "").trim()}
                        style={{ fontSize: 11, flexShrink: 0 }}
                      >
                        {saving === provider.id ? "..." : "Save"}
                      </button>
                    </div>
                    {hasEnvKey && (
                      <div style={{ fontSize: 10, color: "var(--accent)", marginTop: 4, opacity: 0.7 }}>
                        Key detected in environment
                      </div>
                    )}
                  </div>
                )}

                {provider.id === "ollama" && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                      Ollama URL
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={baseUrlInputs[provider.id] ?? provider.baseUrl ?? "http://localhost:11434"}
                        onChange={e => setBaseUrlInputs(prev => ({ ...prev, [provider.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") void saveBaseUrl(provider.id); }}
                        style={{
                          flex: 1, background: "var(--bg-3)", border: "1px solid var(--border)",
                          borderRadius: "var(--radius)", color: "var(--text)", fontSize: 11,
                          fontFamily: "var(--font)", padding: "5px 8px", outline: "none",
                        }}
                      />
                      <button
                        onClick={() => void saveBaseUrl(provider.id)}
                        disabled={saving === provider.id}
                        style={{
                          padding: "5px 10px", background: "none", border: "1px solid var(--border)",
                          borderRadius: "var(--radius)", color: "var(--text-dim)", fontSize: 11,
                          fontFamily: "var(--font-ui)", cursor: "pointer", flexShrink: 0,
                        }}
                      >
                        Set
                      </button>
                    </div>
                  </div>
                )}

                {provider.id === "claude" && (
                  <div style={{ fontSize: 11, color: "var(--text-dimmer)", lineHeight: 1.5 }}>
                    Uses CLI auth — no API key needed. Run <code style={{ color: "var(--accent)", fontFamily: "var(--font)" }}>claude auth</code> to authenticate.
                  </div>
                )}

                {provModels.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                      Model
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {provModels.map(m => {
                        const isCurrent = isActive && m === data.model;
                        return (
                          <div
                            key={m}
                            onClick={() => { if (isActive) void setActive(provider.id, m); }}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "5px 10px", borderRadius: "var(--radius-sm)",
                              background: isCurrent ? "var(--accent-bg)" : "var(--bg-3)",
                              border: `1px solid ${isCurrent ? "var(--accent-border)" : "var(--border-dim)"}`,
                              cursor: isActive ? "pointer" : "default",
                            }}
                          >
                            <code style={{ fontSize: 11, color: isCurrent ? "var(--accent)" : "var(--text-dim)", fontFamily: "var(--font)" }}>
                              {m}
                            </code>
                            {isCurrent && <span style={{ fontSize: 9, color: "var(--accent)", opacity: 0.7 }}>active</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {!isActive && (
                    <button
                      className={effectivelyHasKey ? "btn btn-primary" : "btn"}
                      onClick={() => void setActive(provider.id)}
                      style={{ fontSize: 11 }}
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    className="btn btn-sm"
                    onClick={() => void testConnection(provider.id)}
                    disabled={ts === "testing"}
                    style={{
                      color: ts === "ok" ? "var(--accent)" : ts === "fail" ? "var(--red)" : undefined,
                    }}
                  >
                    {ts === "testing" ? "Testing..." : ts === "ok" ? "Connected" : ts === "fail" ? "Failed" : "Test connection"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScanConfigPanel() {
  const [config, setConfig] = useState<ScanConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then(r => r.json())
      .then((d: ScanConfig) => setConfig(d))
      .catch(() => {});
  }, []);

  function update(patch: Partial<ScanConfig>) {
    setConfig(prev => prev ? { ...prev, ...patch } : prev);
    setDirty(true);
    setSaved(false);
  }

  function toggleFormat(id: string) {
    if (!config) return;
    const next = config.formats.includes(id)
      ? config.formats.filter(f => f !== id)
      : [...config.formats, id];
    update({ formats: next });
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setDirty(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Skeleton width="40%" height={14} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map(i => (
            <Skeleton key={i} width="70%" height={12} />
          ))}
        </div>
        <Skeleton width="100%" height={18} borderRadius="var(--radius)" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border-dim)" }}>
        <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, marginBottom: 2 }}>Default Formats</div>
        <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginBottom: 12 }}>Which output files to generate on each scan</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ALL_FORMATS.map(fmt => {
            const checked = config.formats.includes(fmt.id);
            return (
              <label
                key={fmt.id}
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleFormat(fmt.id)}
                  style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                />
                <code style={{ fontSize: 12, color: checked ? "var(--text)" : "var(--text-dim)", fontFamily: "var(--font)", flex: 1 }}>
                  {fmt.label}
                </code>
                <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>{fmt.desc}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, padding: "14px 0", borderBottom: "1px solid var(--border-dim)",
      }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>Max Tokens</div>
          <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginTop: 2 }}>Token budget cap per generated file</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range" min={10000} max={500000} step={5000}
            value={config.maxTokens}
            onChange={e => update({ maxTokens: Number(e.target.value) })}
            style={{ width: 120, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font)", minWidth: 52, textAlign: "right" }}>
            {(config.maxTokens / 1000).toFixed(0)}k
          </span>
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, padding: "14px 0", borderBottom: "1px solid var(--border-dim)",
      }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>Watch Mode Debounce</div>
          <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginTop: 2 }}>Delay before re-scanning after a file change (ms)</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range" min={500} max={10000} step={500}
            value={config.watchDebounceMs}
            onChange={e => update({ watchDebounceMs: Number(e.target.value) })}
            style={{ width: 120, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font)", minWidth: 52, textAlign: "right" }}>
            {config.watchDebounceMs}ms
          </span>
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, padding: "14px 0", borderBottom: "1px solid var(--border-dim)",
      }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>Auto-Rescan on File Change</div>
          <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginTop: 2 }}>Automatically trigger a scan when project files change</div>
        </div>
        <Toggle checked={config.autoRescan} onChange={v => update({ autoRescan: v })} />
      </div>

      <div style={{ paddingTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => void save()}
          disabled={!dirty || saving}
          className={dirty ? "btn btn-primary" : "btn"}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saved && (
          <span style={{ fontSize: 11, color: "var(--accent)" }}>Saved</span>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const [active, setActive] = useState<string>(() => restore("settings_tab", "appearance"));
  const [navWidth, setNavWidth] = useState<number>(() => restore("settings_nav_w", 180));
  const [navSearch, setNavSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredGroups = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.filter(group => {
      if (group.toLowerCase().includes(q)) return true;
      return SECTIONS.some(s => s.group === group && s.label.toLowerCase().includes(q));
    });
  }, [navSearch]);

  const filteredSections = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(s =>
      s.label.toLowerCase().includes(q) || s.group.toLowerCase().includes(q)
    );
  }, [navSearch]);

  const [info, setInfo]         = useState<InfoData | null>(null);
  const [mcpConfig, setMcpConfig] = useState<McpConfigData | null>(null);
  const [envVars, setEnvVars]   = useState<EnvVar[]>([]);
  const [detectedCLIs, setDetectedCLIs] = useState<DetectedCLI[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [theme,       setTheme]       = useState<"dark" | "light">(() => restore("theme", "dark"));
  const [fontSize,    setFontSize]    = useState<number>(() => restore("font_size", 13));
  const [uiDensity,   setUiDensity]   = useState<"comfortable" | "compact">(() => restore("ui_density", "comfortable"));
  const [showLineNums, setShowLineNums] = useState<boolean>(() => restore("line_nums", true));

  const [defaultModel, setDefaultModel] = useState<string>(() => restore("selectedModel", "claude-sonnet-4-6"));
  const [thinkingMode, setThinkingMode] = useState<boolean>(() => restore("thinking", false));
  const [streamingUI,  setStreamingUI]  = useState<boolean>(() => restore("streaming_ui", true));
  const [systemPrompt, setSystemPrompt] = useState<string>(() => restore("system_prompt", ""));
  const [restoreSession, setRestoreSession] = useState<boolean>(() => restore("restoreSession", true));

  const [autoStage,    setAutoStage]    = useState<boolean>(() => restore("git_auto_stage", false));
  const [commitFormat, setCommitFormat] = useState<string>(() => restore("git_commit_fmt", "conventional"));
  const [showGitInNav, setShowGitInNav] = useState<boolean>(() => restore("git_in_nav", true));

  const [planMode,      setPlanMode]      = useState<boolean>(() => restore("planMode", false));
  const [multiAgent,    setMultiAgent]    = useState<boolean>(() => restore("multi_agent", false));
  const [betaFeatures,  setBetaFeatures]  = useState<boolean>(() => restore("beta_features", false));

  useEffect(() => persist("settings_tab", active), [active]);
  useEffect(() => persist("settings_nav_w", navWidth), [navWidth]);
  useEffect(() => {
    persist("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    window.dispatchEvent(new CustomEvent("studio:theme-change", { detail: theme }));
  }, [theme]);
  useEffect(() => {
    persist("font_size", fontSize);
    document.documentElement.style.setProperty("--font-size-base", `${fontSize}px`);
    dispatch("font_size", fontSize);
  }, [fontSize]);
  useEffect(() => {
    persist("ui_density", uiDensity);
    document.documentElement.setAttribute("data-density", uiDensity);
    dispatch("ui_density", uiDensity);
  }, [uiDensity]);
  useEffect(() => { persist("line_nums", showLineNums); dispatch("line_nums", showLineNums); }, [showLineNums]);
  useEffect(() => { persist("selectedModel", defaultModel); dispatch("selectedModel", defaultModel); }, [defaultModel]);
  useEffect(() => { persist("thinking", thinkingMode); dispatch("thinking", thinkingMode); }, [thinkingMode]);
  useEffect(() => { persist("streaming_ui", streamingUI); dispatch("streaming_ui", streamingUI); }, [streamingUI]);
  useEffect(() => { persist("system_prompt", systemPrompt); dispatch("system_prompt", systemPrompt); }, [systemPrompt]);
  useEffect(() => { persist("restoreSession", restoreSession); dispatch("restoreSession", restoreSession); }, [restoreSession]);
  useEffect(() => { persist("git_auto_stage", autoStage); dispatch("git_auto_stage", autoStage); }, [autoStage]);
  useEffect(() => { persist("git_commit_fmt", commitFormat); dispatch("git_commit_fmt", commitFormat); }, [commitFormat]);
  useEffect(() => { persist("git_in_nav", showGitInNav); dispatch("git_in_nav", showGitInNav); }, [showGitInNav]);
  useEffect(() => { persist("planMode", planMode); dispatch("planMode", planMode); }, [planMode]);
  useEffect(() => { persist("multi_agent", multiAgent); dispatch("multi_agent", multiAgent); }, [multiAgent]);
  useEffect(() => { persist("beta_features", betaFeatures); dispatch("beta_features", betaFeatures); }, [betaFeatures]);

  useEffect(() => {
    fetch("/api/info").then(r => r.json()).then(setInfo).catch(() => {
      window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Failed to load project info", type: "error" } }));
    });
    fetch("/api/mcp/config").then(r => r.json()).then(setMcpConfig).catch(() => {});
    fetch("/api/settings/env").then(r => r.json()).then((d: { vars: EnvVar[] }) => setEnvVars(d.vars ?? [])).catch(() => {});
    fetch("/api/providers/detect").then(r => r.json()).then((d: { providers: DetectedCLI[] }) => setDetectedCLIs(d.providers ?? [])).catch(() => {
      window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Failed to detect providers", type: "error" } }));
    });
  }, []);

  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(0);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = navWidth;
    e.preventDefault();
  }, [navWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const w = Math.max(140, Math.min(280, startW.current + (e.clientX - startX.current)));
      setNavWidth(w);
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      <nav style={{
        width: navWidth,
        minWidth: navWidth,
        maxWidth: navWidth,
        background: "var(--bg-2)",
        borderRight: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        <div style={{
          padding: "16px 14px 8px",
          fontSize: "10px",
          fontWeight: 700,
          color: "var(--text-dimmer)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}>
          Settings
        </div>

        <div style={{ padding: "0 8px 6px", position: "relative" }}>
          <input
            ref={searchRef}
            type="text"
            value={navSearch}
            onChange={e => setNavSearch(e.target.value)}
            placeholder="Search settings..."
            style={{
              width: "100%",
              fontSize: 11,
              fontFamily: "var(--font-ui)",
              background: "var(--bg-3)",
              border: "1px solid var(--border-dim)",
              borderRadius: "var(--radius)",
              color: "var(--text)",
              padding: "4px 24px 4px 8px",
              outline: "none",
            }}
          />
          {navSearch && (
            <button
              onClick={() => { setNavSearch(""); searchRef.current?.focus(); }}
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                color: "var(--text-dimmer)",
                padding: 2,
                lineHeight: 1,
              }}
            >
              x
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 12px" }}>
          {filteredGroups.map(group => {
            const groupSections = filteredSections.filter(s => s.group === group);
            if (groupSections.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: 4 }}>
                <div style={{
                  fontSize: 9,
                  color: "var(--text-dimmer)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "10px 8px 4px",
                  opacity: 0.6,
                }}>
                  {group}
                </div>
                {groupSections.map(section => (
                  <button
                    key={section.id}
                    onClick={() => setActive(section.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      padding: "6px 8px",
                      background: active === section.id ? "var(--accent-bg)" : "none",
                      border: "none",
                      borderLeft: active === section.id ? "2px solid var(--accent)" : "2px solid transparent",
                      borderRadius: active === section.id ? "0 var(--radius-sm) var(--radius-sm) 0" : 0,
                      color: active === section.id ? "var(--accent)" : "var(--text-dim)",
                      fontSize: 12,
                      fontFamily: "var(--font-ui)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.1s, color 0.1s, border-color 0.1s",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    onMouseEnter={e => {
                      if (active !== section.id)
                        (e.currentTarget).style.background = "var(--hover-bg)";
                    }}
                    onMouseLeave={e => {
                      if (active !== section.id)
                        (e.currentTarget).style.background = "none";
                    }}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            );
          })}
          {filteredSections.length === 0 && navSearch && (
            <div style={{
              padding: "16px 8px",
              fontSize: 11,
              color: "var(--text-dimmer)",
              textAlign: "center",
            }}>
              No matching settings
            </div>
          )}
        </div>
      </nav>

      <div
        onMouseDown={onDragStart}
        style={{
          width: 4,
          cursor: "col-resize",
          background: "transparent",
          flexShrink: 0,
          zIndex: 10,
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--accent)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 36px", minWidth: 0 }}>
        {active === "appearance" && (
          <SectionView title="Appearance" description="Customize how the studio looks and feels.">
            <SettingRow label="Theme" hint="Interface color scheme">
              <SegmentedControl
                value={theme}
                options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
                onChange={v => setTheme(v as "dark" | "light")}
              />
            </SettingRow>
            <SettingRow label="Font Size" hint="Base font size for the UI (px)">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range" min={11} max={18} value={fontSize}
                  onChange={e => setFontSize(Number(e.target.value))}
                  style={{ width: 100, accentColor: "var(--accent)" }}
                />
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font)", minWidth: 24 }}>{fontSize}px</span>
              </div>
            </SettingRow>
            <SettingRow label="UI Density" hint="Spacing and padding across the interface">
              <SegmentedControl
                value={uiDensity}
                options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]}
                onChange={v => setUiDensity(v as "comfortable" | "compact")}
              />
            </SettingRow>
            <SettingRow label="Line Numbers" hint="Show line numbers in file viewer">
              <Toggle checked={showLineNums} onChange={setShowLineNums} />
            </SettingRow>
          </SectionView>
        )}

        {active === "chat" && (
          <SectionView title="Chat" description="Configure the AI chat behavior and defaults.">
            <SettingRow label="Default Model" hint="Model used for new chat sessions">
              <select
                value={defaultModel}
                onChange={e => setDefaultModel(e.target.value)}
                style={{
                  background: "var(--bg-3)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", color: "var(--text)",
                  fontSize: 12, padding: "5px 10px", fontFamily: "var(--font-ui)",
                }}
              >
                <option value="claude-opus-4-6">Claude Opus 4.6 — 1M ctx</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — default</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — fast</option>
              </select>
            </SettingRow>
            <SettingRow label="Extended Thinking" hint="Enable deep reasoning by default (slower, more thorough)">
              <Toggle checked={thinkingMode} onChange={setThinkingMode} />
            </SettingRow>
            <SettingRow label="Streaming UI" hint="Stream responses as they arrive rather than waiting">
              <Toggle checked={streamingUI} onChange={setStreamingUI} />
            </SettingRow>
            <SettingRow label="Restore Session on Startup" hint="Automatically resume last session when the app opens. Disable to see the welcome page.">
              <Toggle checked={restoreSession} onChange={setRestoreSession} />
            </SettingRow>
            <SettingRow label="System Prompt" hint="Injected into every session. Use for persistent context." vertical>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="e.g. You are working in a TypeScript monorepo. Always follow CLAUDE.md instructions."
                rows={5}
                style={{
                  width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", color: "var(--text)", fontSize: 12,
                  fontFamily: "var(--font)", padding: "8px 10px", resize: "vertical",
                  lineHeight: 1.5,
                }}
              />
            </SettingRow>
          </SectionView>
        )}

        {active === "project" && (
          <SectionView title="Project" description="Current workspace and project details.">
            <ReadonlyField label="Project Name" value={info?.projectName ?? "..."} />
            <ReadonlyField label="Project Directory" value={info?.projectDir ?? "..."} mono />
            <ReadonlyField label="Agents Path" value={`${info?.projectDir ?? "~"}/.claude/agents/`} mono />
            <ReadonlyField label="Claude MD" value={`${info?.projectDir ?? "~"}/CLAUDE.md`} mono />
          </SectionView>
        )}

        {active === "git" && (
          <SectionView title="Git" description="Version control behavior and preferences.">
            <SettingRow label="Auto-Stage on Scan" hint="Automatically stage generated files after a scan">
              <Toggle checked={autoStage} onChange={setAutoStage} />
            </SettingRow>
            <SettingRow label="Show Git in Nav" hint="Show git changed-files count badge in the sidebar">
              <Toggle checked={showGitInNav} onChange={setShowGitInNav} />
            </SettingRow>
            <SettingRow label="Commit Format" hint="Conventional commits format for generated commit messages">
              <SegmentedControl
                value={commitFormat}
                options={[
                  { value: "conventional", label: "Conventional" },
                  { value: "simple", label: "Simple" },
                  { value: "none", label: "None" },
                ]}
                onChange={v => setCommitFormat(v)}
              />
            </SettingRow>
          </SectionView>
        )}

        {active === "env" && (
          <SectionView title="Environment" description="Environment variables visible to studio. Read from .env / .env.local — never editable here.">
            {envVars.length === 0 ? (
              <EmptyState
                icon="⊘"
                title="No .env files found"
                description="Create a .env or .env.local in your project root to see them here."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {envVars.map(v => (
                  <div
                    key={v.key}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "var(--bg-2)", border: "1px solid var(--border-dim)",
                      borderRadius: "var(--radius)", padding: "8px 12px",
                    }}
                  >
                    <code style={{ fontSize: 11, color: "var(--accent)", fontFamily: "var(--font)" }}>{v.key}</code>
                    <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font-ui)" }}>{v.source}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionView>
        )}

        {active === "workspace" && (
          <SectionView title="Workspace" description="Setup scripts and run commands for this project.">
            <InfoNote>
              Configure setup and run commands in <code style={{ color: "var(--accent)" }}>.hashmark/workspace.json</code> or use the{" "}
              <a href="/setup" style={{ color: "var(--blue)" }}>Workspace Setup</a> page for a guided experience.
            </InfoNote>
            <SettingRow label="Setup Script" hint="Runs once on workspace init (e.g. npm install)" vertical>
              <ReadonlyField label="" value={`${info?.projectDir ?? "~"}/.hashmark/workspace.json`} mono />
            </SettingRow>
          </SectionView>
        )}

        {active === "providers" && (
          <SectionView title="Providers" description="Configure AI providers, API keys, and model selection.">
            <InfoNote>
              Claude uses CLI auth by default — no key needed. For other providers, enter your API key below or set the corresponding env var in <code style={{ color: "var(--accent)" }}>.env.local</code>.
            </InfoNote>
            <ProviderPanel envVars={envVars} />
          </SectionView>
        )}

        {active === "scan" && (
          <SectionView title="Scan" description="Default behavior for hashmark scans and output generation.">
            <ScanConfigPanel />
          </SectionView>
        )}

        {active === "claude-code" && (
          <SectionView title="Claude Code" description="Configuration for the Claude CLI used to execute agent tasks.">
            <InfoNote>
              Tasks use your locally installed <code style={{ color: "var(--accent)" }}>claude</code> CLI.
              Authentication is inherited from your existing Claude account — no API key required.
            </InfoNote>
            <ReadonlyField label="CLI Path" value="claude (from $PATH)" mono />
            <ReadonlyField label="Config Location" value="~/.claude/" mono />
            <ReadonlyField label="Auth" value="Browser auth via claude.ai — run `claude auth` to set up" mono />
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Useful Commands
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  ["claude auth",           "Authenticate with Claude"],
                  ["claude --version",      "Check CLI version"],
                  ["claude --help",         "Full CLI reference"],
                  ["claude mcp list",       "List MCP servers"],
                ].map(([cmd, desc]) => (
                  <div key={cmd} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    background: "var(--bg-2)", border: "1px solid var(--border-dim)",
                    borderRadius: "var(--radius)", padding: "7px 12px",
                  }}>
                    <code style={{ fontSize: 11, color: "var(--text)", fontFamily: "var(--font)", flexShrink: 0 }}>{cmd}</code>
                    <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionView>
        )}

        {active === "mcp" && (
          <SectionView title="MCP Servers" description="Model Context Protocol servers injected into Claude sessions.">
            {!mcpConfig ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[1, 2].map(i => <SkeletonCard key={i} height={40} />)}
              </div>
            ) : Object.keys(mcpConfig.servers).length === 0 ? (
              <EmptyState
                icon="⊕"
                title="No MCP servers configured"
                description="Add a .mcp.json to your project root or configure servers in ~/.claude/mcp.json"
              />
            ) : (
              <>
                <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginBottom: 12 }}>
                  {Object.keys(mcpConfig.servers).length} server{Object.keys(mcpConfig.servers).length !== 1 ? "s" : ""} active
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(mcpConfig.servers).map(([name, server]) => (
                    <div
                      key={name}
                      style={{
                        background: "var(--bg-2)", border: "1px solid var(--border-dim)",
                        borderRadius: "var(--radius)", padding: "10px 12px",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, color: "var(--text)", fontFamily: "var(--font)", fontWeight: 600 }}>{name}</div>
                        <div style={{ fontSize: 10, color: "var(--text-dimmer)", marginTop: 2, fontFamily: "var(--font)" }}>{server.command}</div>
                      </div>
                      <span style={{
                        fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
                        color: server.source === "project" ? "var(--accent)" : "var(--text-dimmer)",
                      }}>
                        {server.source === "project" ? ".mcp.json" : "global"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {mcpConfig?.sources && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Config Sources
                </div>
                {mcpConfig.sources.map(s => (
                  <div key={s.path} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 0", borderBottom: "1px solid var(--border-dim)", fontSize: 11,
                  }}>
                    <code style={{ color: "var(--text-dim)", fontFamily: "var(--font)" }}>{s.path}</code>
                    <span style={{
                      color: s.exists ? "var(--accent)" : "var(--text-dimmer)",
                      fontSize: 10,
                    }}>
                      {s.exists ? `${s.serverCount} server${s.serverCount !== 1 ? "s" : ""}` : "not found"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionView>
        )}

        {active === "api-keys" && (
          <SectionView title="API Keys" description="Keys read from environment variables. Never stored by Studio.">
            <InfoNote>
              API keys are loaded from <code style={{ color: "var(--accent)" }}>.env.local</code> or your shell environment.
              Set them there — Studio only reads, never writes.
            </InfoNote>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {[
                ["ANTHROPIC_API_KEY",  "Claude (Anthropic)",      "claude-*"],
                ["OPENAI_API_KEY",     "OpenAI / GPT",            "gpt-*, o*"],
                ["GOOGLE_AI_API_KEY",  "Google Gemini",           "gemini-*"],
                ["XAI_API_KEY",        "xAI Grok",                "grok-*"],
                ["MISTRAL_API_KEY",    "Mistral",                 "mistral-*"],
                ["GROQ_API_KEY",       "Groq",                    "mixtral-*, llama*"],
              ].map(([key, label, models]) => (
                <div
                  key={key}
                  style={{
                    background: "var(--bg-2)", border: "1px solid var(--border-dim)",
                    borderRadius: "var(--radius)", padding: "10px 14px",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--text)" }}>{label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                      <code style={{ fontSize: 10, color: "var(--accent)", fontFamily: "var(--font)" }}>{key}</code>
                      <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>— {models}</span>
                    </div>
                  </div>
                  <ApiKeyStatus envKey={key} envVars={envVars} />
                </div>
              ))}
            </div>
          </SectionView>
        )}

        {active === "studio" && (
          <SectionView title="About Studio" description="Version information and diagnostic details.">
            <ReadonlyField label="Version" value="0.1.0" mono />
            <ReadonlyField label="Runtime" value="Electron + Vite + React" />
            <ReadonlyField label="Node Version" value={info?.nodeVersion ?? "..."} mono />

            {detectedCLIs.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  Detected CLI Tools
                </div>
                <div style={{
                  background: "var(--bg-2)", border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius)", overflow: "hidden",
                }}>
                  {detectedCLIs.filter(c => c.installed).length === 0 && (
                    <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-dimmer)" }}>
                      No AI CLI tools detected on this system.
                    </div>
                  )}
                  {detectedCLIs.filter(c => c.installed).map((cli, i, arr) => (
                    <div
                      key={cli.id}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px",
                        borderBottom: i < arr.length - 1 ? "1px solid var(--border-dim)" : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--text)" }}>{cli.name}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
                        {cli.version ?? "installed"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                Links
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  ["Changelog", "https://github.com/jpoindexter/hashmark/releases"],
                  ["Docs",      "https://hashmark.md"],
                  ["Feedback",  "https://github.com/jpoindexter/hashmark/issues"],
                ].map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm"
                  >
                    {label} ↗
                  </a>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <button
                onClick={() => setAdvancedOpen(v => !v)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase",
                  letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span style={{
                  display: "inline-block", transition: "transform 0.15s",
                  transform: advancedOpen ? "rotate(90deg)" : "rotate(0deg)",
                  fontSize: 8,
                }}>
                  ▶
                </span>
                Advanced
              </button>
              {advancedOpen && (
                <div style={{ marginTop: 12 }}>
                  <ReadonlyField label="Port" value={info?.port != null ? String(info.port) : "..."} mono />
                  <ReadonlyField label="Project Directory" value={info?.projectDir ?? "..."} mono />
                </div>
              )}
            </div>
          </SectionView>
        )}

        {active === "experimental" && (
          <SectionView title="Experimental" description="Features in active development. May be unstable or change without notice.">
            <InfoNote variant="warning">
              Experimental features can break things. Use at your own risk.
            </InfoNote>
            <SettingRow label="Plan Mode" hint="Chat responds with plans only — no code generation">
              <Toggle checked={planMode} onChange={setPlanMode} />
            </SettingRow>
            <SettingRow label="Multi-Agent" hint="Run multiple agent sessions in parallel (experimental)">
              <Toggle checked={multiAgent} onChange={setMultiAgent} />
            </SettingRow>
            <SettingRow label="Beta Features" hint="Enable unreleased features as they become available">
              <Toggle checked={betaFeatures} onChange={setBetaFeatures} />
            </SettingRow>
          </SectionView>
        )}
      </div>
    </div>
  );
}

function SectionView({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)", marginBottom: 4 }}>
          {title}
        </h2>
        <div style={{ fontSize: 12, color: "var(--text-dimmer)", lineHeight: 1.5 }}>{description}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {children}
      </div>
    </div>
  );
}

function SettingRow({
  label, hint, children, vertical,
}: { label: string; hint?: string; children: React.ReactNode; vertical?: boolean }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: vertical ? "column" : "row",
      alignItems: vertical ? "flex-start" : "center",
      justifyContent: "space-between",
      gap: vertical ? 8 : 16,
      padding: "14px 0",
      borderBottom: "1px solid var(--border-dim)",
    }}>
      <div style={{ flex: vertical ? undefined : 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0, width: vertical ? "100%" : undefined }}>
        {children}
      </div>
    </div>
  );
}

function ReadonlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border-dim)" }}>
      {label && (
        <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          {label}
        </div>
      )}
      <div style={{
        fontSize: 12, color: "var(--text-dim)",
        fontFamily: mono ? "var(--font)" : undefined,
        background: "var(--bg-2)", border: "1px solid var(--border-dim)",
        borderRadius: "var(--radius)", padding: "8px 10px",
      }}>
        {value}
      </div>
    </div>
  );
}

function SegmentedControl({
  value, options, onChange,
}: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div style={{
      display: "inline-flex", background: "var(--bg-4)",
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      overflow: "hidden",
    }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: "4px 12px", border: "none", cursor: "pointer",
            fontSize: 11, fontFamily: "var(--font-ui)",
            background: value === opt.value ? "var(--bg-3)" : "transparent",
            color: value === opt.value ? "var(--text)" : "var(--text-dimmer)",
            fontWeight: value === opt.value ? 600 : 400,
            transition: "background 0.1s, color 0.1s",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function InfoNote({ children, variant = "info" }: { children: React.ReactNode; variant?: "info" | "warning" }) {
  return (
    <div style={{
      background: variant === "warning" ? "rgba(210,153,34,0.08)" : "var(--bg-2)",
      border: `1px solid ${variant === "warning" ? "rgba(210,153,34,0.25)" : "var(--border-dim)"}`,
      borderRadius: "var(--radius)",
      padding: "10px 14px",
      fontSize: 12,
      color: variant === "warning" ? "var(--yellow)" : "var(--text-dim)",
      lineHeight: 1.6,
      marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div style={{
      background: "var(--bg-2)", border: "1px dashed var(--border)",
      borderRadius: "var(--radius)", padding: "32px 24px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 24, marginBottom: 8, color: "var(--text-dimmer)" }}>{icon}</div>
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 11, color: "var(--text-dimmer)", lineHeight: 1.5 }}>{description}</div>
    </div>
  );
}

function ApiKeyStatus({ envKey, envVars }: { envKey: string; envVars: EnvVar[] }) {
  const found = envVars.find(v => v.key === envKey);
  const isSet = found !== undefined;
  return (
    <span style={{
      fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em",
      color: isSet ? "var(--accent)" : "var(--text-dimmer)",
      fontFamily: "var(--font-ui)", whiteSpace: "nowrap",
    }}>
      {isSet ? "✓ set" : "not set"}
    </span>
  );
}
