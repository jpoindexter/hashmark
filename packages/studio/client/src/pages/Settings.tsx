import { useState, useEffect, useRef, useCallback } from "react";

/* ─── types ─────────────────────────────────────────────────────────────── */
interface InfoData {
  projectName: string;
  projectDir: string;
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

/* ─── nav sections ──────────────────────────────────────────────────────── */
const SECTIONS = [
  { id: "appearance",   label: "Appearance",   group: "Studio" },
  { id: "chat",         label: "Chat",         group: "Studio" },
  { id: "project",      label: "Project",      group: "Workspace" },
  { id: "git",          label: "Git",          group: "Workspace" },
  { id: "env",          label: "Environment",  group: "Workspace" },
  { id: "workspace",    label: "Workspace",    group: "Workspace" },
  { id: "claude-code",  label: "Claude Code",  group: "Integrations" },
  { id: "mcp",          label: "MCP Servers",  group: "Integrations" },
  { id: "api-keys",     label: "API Keys",     group: "Integrations" },
  { id: "studio",       label: "About Studio", group: "System" },
  { id: "experimental", label: "Experimental", group: "System" },
];

const GROUPS = Array.from(new Set(SECTIONS.map(s => s.group)));

/* ─── persists ───────────────────────────────────────────────────────────── */
function persist(key: string, val: unknown) {
  try { localStorage.setItem(`settings_${key}`, JSON.stringify(val)); } catch {}
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`settings_${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

/* ─── Toggle component ──────────────────────────────────────────────────── */
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
        width: 14, height: 14, borderRadius: "50%", background: "#fff",
        transition: "left 0.15s",
      }} />
    </button>
  );
}

/* ─── main ───────────────────────────────────────────────────────────────── */
export default function Settings() {
  const [active, setActive] = useState<string>(() => restore("settings_tab", "appearance"));
  const [navWidth, setNavWidth] = useState<number>(() => restore("settings_nav_w", 180));

  const [info, setInfo]         = useState<InfoData | null>(null);
  const [mcpConfig, setMcpConfig] = useState<McpConfigData | null>(null);
  const [envVars, setEnvVars]   = useState<EnvVar[]>([]);

  // Appearance
  const [theme,       setTheme]       = useState<"dark" | "light">(() => restore("theme", "dark"));
  const [fontSize,    setFontSize]    = useState<number>(() => restore("font_size", 13));
  const [uiDensity,   setUiDensity]   = useState<"comfortable" | "compact">(() => restore("ui_density", "comfortable"));
  const [showLineNums, setShowLineNums] = useState<boolean>(() => restore("line_nums", true));

  // Chat
  const [defaultModel, setDefaultModel] = useState<string>(() => restore("model", "claude-sonnet-4-6"));
  const [thinkingMode, setThinkingMode] = useState<boolean>(() => restore("thinking", false));
  const [streamingUI,  setStreamingUI]  = useState<boolean>(() => restore("streaming_ui", true));
  const [systemPrompt, setSystemPrompt] = useState<string>(() => restore("system_prompt", ""));

  // Git
  const [autoStage,    setAutoStage]    = useState<boolean>(() => restore("git_auto_stage", false));
  const [commitFormat, setCommitFormat] = useState<string>(() => restore("git_commit_fmt", "conventional"));
  const [showGitInNav, setShowGitInNav] = useState<boolean>(() => restore("git_in_nav", true));

  // Experimental
  const [planMode,      setPlanMode]      = useState<boolean>(() => restore("plan_mode", false));
  const [multiAgent,    setMultiAgent]    = useState<boolean>(() => restore("multi_agent", false));
  const [betaFeatures,  setBetaFeatures]  = useState<boolean>(() => restore("beta_features", false));

  // Persist on change
  useEffect(() => persist("settings_tab", active), [active]);
  useEffect(() => persist("settings_nav_w", navWidth), [navWidth]);
  useEffect(() => persist("theme", theme), [theme]);
  useEffect(() => persist("font_size", fontSize), [fontSize]);
  useEffect(() => persist("ui_density", uiDensity), [uiDensity]);
  useEffect(() => persist("line_nums", showLineNums), [showLineNums]);
  useEffect(() => persist("model", defaultModel), [defaultModel]);
  useEffect(() => persist("thinking", thinkingMode), [thinkingMode]);
  useEffect(() => persist("streaming_ui", streamingUI), [streamingUI]);
  useEffect(() => persist("system_prompt", systemPrompt), [systemPrompt]);
  useEffect(() => persist("git_auto_stage", autoStage), [autoStage]);
  useEffect(() => persist("git_commit_fmt", commitFormat), [commitFormat]);
  useEffect(() => persist("git_in_nav", showGitInNav), [showGitInNav]);
  useEffect(() => persist("plan_mode", planMode), [planMode]);
  useEffect(() => persist("multi_agent", multiAgent), [multiAgent]);
  useEffect(() => persist("beta_features", betaFeatures), [betaFeatures]);

  useEffect(() => {
    fetch("/api/info").then(r => r.json()).then(setInfo).catch(() => {});
    fetch("/api/mcp/config").then(r => r.json()).then(setMcpConfig).catch(() => {});
    fetch("/api/settings/env").then(r => r.json()).then((d: { vars: EnvVar[] }) => setEnvVars(d.vars ?? [])).catch(() => {});
  }, []);

  /* ── draggable nav ─────────────────────────────────────────────────────── */
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

      {/* ── Left nav tray ────────────────────────────────────────────────── */}
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

        <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 12px" }}>
          {GROUPS.map(group => (
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
              {SECTIONS.filter(s => s.group === group).map(section => (
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
                      (e.currentTarget).style.background = "rgba(255,255,255,0.04)";
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
          ))}
        </div>
      </nav>

      {/* ── Drag handle ──────────────────────────────────────────────────── */}
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

      {/* ── Content area ─────────────────────────────────────────────────── */}
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
              <span style={{ fontSize: 12, color: "var(--text-dimmer)" }}>Loading...</span>
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
            <ReadonlyField label="Port" value="3200" mono />
            <ReadonlyField label="Runtime" value="Electron + Vite + React" />
            <ReadonlyField label="Node Version" value={typeof process !== "undefined" ? process.versions?.node ?? "—" : "—"} mono />
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                Links
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  ["Changelog", "https://hashmark.md/changelog"],
                  ["Docs",      "https://hashmark.md/docs"],
                  ["Feedback",  "https://github.com/hashmark/studio/issues"],
                ].map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="btn"
                    style={{ fontSize: 11 }}
                  >
                    {label} ↗
                  </a>
                ))}
              </div>
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

/* ─── sub-components ─────────────────────────────────────────────────────── */

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
