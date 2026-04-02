import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "../hooks/useToast";
import type { EnvVar } from "../components/settings/SettingsPrimitives";
import type { McpConfigData } from "../components/settings/McpSection";
import type { InfoData } from "../components/settings/WorkspaceSection";
import AppearanceSection from "../components/settings/AppearanceSection";
import ChatSection from "../components/settings/ChatSection";
import { ProjectSection, GitSection, EnvSection, WorkspaceSetupSection } from "../components/settings/WorkspaceSection";
import { ProvidersSection, ScanSection, ApiKeysSection } from "../components/settings/ProvidersSection";
import ClaudeCodeSection from "../components/settings/ClaudeCodeSection";
import McpSection from "../components/settings/McpSection";
import { StudioSection, ExperimentalSection } from "../components/settings/AboutSection";

interface DetectedCLI {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  path?: string;
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

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio:${key}`, JSON.stringify(val)); } catch {}
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
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

  const [info, setInfo] = useState<InfoData | null>(null);
  const [mcpConfig, setMcpConfig] = useState<McpConfigData | null>(null);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [detectedCLIs, setDetectedCLIs] = useState<DetectedCLI[]>([]);

  useEffect(() => persist("settings_tab", active), [active]);
  useEffect(() => persist("settings_nav_w", navWidth), [navWidth]);

  useEffect(() => {
    fetchApi("/api/info").then(r => r.json()).then(setInfo).catch(() => {
      toast.error("Failed to load project info");
    });
    fetchApi("/api/mcp/config").then(r => r.json()).then(setMcpConfig).catch(() => {});
    fetchApi("/api/settings/env").then(r => r.json()).then((d: { vars: EnvVar[] }) => setEnvVars(d.vars ?? [])).catch(() => {});
    fetchApi("/api/providers/detect").then(r => r.json()).then((d: { providers: DetectedCLI[] }) => setDetectedCLIs(d.providers ?? [])).catch(() => {
      toast.error("Failed to detect providers");
    });
  }, []);

  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

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

  function renderActiveSection() {
    switch (active) {
      case "appearance":   return <AppearanceSection />;
      case "chat":         return <ChatSection />;
      case "project":      return <ProjectSection info={info} />;
      case "git":          return <GitSection />;
      case "env":          return <EnvSection envVars={envVars} />;
      case "workspace":    return <WorkspaceSetupSection info={info} />;
      case "providers":    return <ProvidersSection envVars={envVars} />;
      case "scan":         return <ScanSection />;
      case "claude-code":  return <ClaudeCodeSection />;
      case "mcp":          return <McpSection mcpConfig={mcpConfig} />;
      case "api-keys":     return <ApiKeysSection envVars={envVars} />;
      case "studio":       return <StudioSection info={info} detectedCLIs={detectedCLIs} />;
      case "experimental": return <ExperimentalSection />;
      default:             return null;
    }
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <SettingsNav
        active={active}
        setActive={setActive}
        navWidth={navWidth}
        navSearch={navSearch}
        setNavSearch={setNavSearch}
        searchRef={searchRef}
        filteredGroups={filteredGroups}
        filteredSections={filteredSections}
      />

      <div
        onMouseDown={onDragStart}
        className="hoverable-accent"
        style={{
          width: 4, cursor: "col-resize", background: "transparent",
          flexShrink: 0, zIndex: 10,
        }}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 36px", minWidth: 0 }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {renderActiveSection()}
        </div>
      </div>
    </div>
  );
}

function SettingsNav({
  active, setActive, navWidth, navSearch, setNavSearch, searchRef,
  filteredGroups, filteredSections,
}: {
  active: string;
  setActive: (id: string) => void;
  navWidth: number;
  navSearch: string;
  setNavSearch: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  filteredGroups: string[];
  filteredSections: typeof SECTIONS;
}) {
  return (
    <nav style={{
      width: navWidth, minWidth: navWidth, maxWidth: navWidth,
      background: "var(--bg-2)", borderRight: "1px solid var(--border-dim)",
      display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0,
    }}>
      <div className="label" style={{ padding: "16px 14px 8px" }}>
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
            width: "100%", fontSize: 11, fontFamily: "var(--font-ui)",
            background: "var(--bg-3)", border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius)", color: "var(--text)",
            padding: "4px 24px 4px 8px", outline: "none",
          }}
        />
        {navSearch && (
          <button
            onClick={() => { setNavSearch(""); searchRef.current?.focus(); }}
            style={{
              position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              fontSize: 11, color: "var(--text-dimmer)", padding: 2, lineHeight: 1,
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
                fontSize: 9, color: "var(--text-dimmer)", textTransform: "uppercase",
                letterSpacing: "0.08em", padding: "10px 8px 4px", opacity: 0.6,
              }}>
                {group}
              </div>
              {groupSections.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActive(section.id)}
                  style={{
                    display: "flex", alignItems: "center", width: "100%",
                    padding: "6px 8px",
                    background: active === section.id ? "var(--accent-bg)" : "none",
                    border: "none",
                    borderLeft: active === section.id ? "2px solid var(--accent)" : "2px solid transparent",
                    borderRadius: active === section.id ? "0 var(--radius-sm) var(--radius-sm) 0" : 0,
                    color: active === section.id ? "var(--accent)" : "var(--text-dim)",
                    fontSize: 12, fontFamily: "var(--font-ui)", cursor: "pointer",
                    textAlign: "left", transition: "background 0.1s, color 0.1s, border-color 0.1s",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                  onMouseEnter={e => {
                    if (active !== section.id) (e.currentTarget).style.background = "var(--hover-bg)";
                  }}
                  onMouseLeave={e => {
                    if (active !== section.id) (e.currentTarget).style.background = "none";
                  }}
                >
                  {section.label}
                </button>
              ))}
            </div>
          );
        })}
        {filteredSections.length === 0 && navSearch && (
          <div style={{ padding: "16px 8px", fontSize: 11, color: "var(--text-dimmer)", textAlign: "center" }}>
            No matching settings
          </div>
        )}
      </div>
    </nav>
  );
}
