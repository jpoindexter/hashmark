import { useState, useEffect } from "react";
import { fetchApi } from "../../lib/api";
import Toggle from "../shared/Toggle";
import { Skeleton } from "../shared/Skeleton";
import { SettingRow } from "./SettingsPrimitives";

interface ScanConfig {
  formats: string[];
  maxTokens: number;
  watchDebounceMs: number;
  autoRescan: boolean;
}

const ALL_FORMATS = [
  { id: "CLAUDE.md", label: "CLAUDE.md", desc: "Anthropic Claude Code" },
  { id: "AGENTS.md", label: "AGENTS.md", desc: "OpenAI Agents / general" },
  { id: ".cursorrules", label: ".cursorrules", desc: "Cursor IDE" },
  { id: "openai-system-prompt", label: "openai-system-prompt", desc: "ChatGPT system prompt" },
  { id: "json", label: "JSON", desc: "Machine-readable output" },
];

export default function ScanConfigPanel() {
  const [config, setConfig] = useState<ScanConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchApi("/api/config").then(r => r.json()).then((d: ScanConfig) => setConfig(d)).catch(() => {});
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
      const res = await fetchApi("/api/config", {
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
          {[1, 2, 3].map(i => <Skeleton key={i} width="70%" height={12} />)}
        </div>
        <Skeleton width="100%" height={18} borderRadius="var(--radius)" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border-dim)" }}>
        <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600, marginBottom: 2 }}>Default Formats</div>
        <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginBottom: 12 }}>Which output files to generate on each scan</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ALL_FORMATS.map(fmt => {
            const checked = config.formats.includes(fmt.id);
            return (
              <label key={fmt.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox" checked={checked} onChange={() => toggleFormat(fmt.id)}
                  style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                />
                <code style={{ fontSize: 12, color: checked ? "var(--text)" : "var(--text-dim)", fontFamily: "var(--font)", flex: 1 }}>{fmt.label}</code>
                <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>{fmt.desc}</span>
              </label>
            );
          })}
        </div>
      </div>

      <SettingRow label="Max Tokens" hint="Token budget cap per generated file">
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
      </SettingRow>

      <SettingRow label="Watch Mode Debounce" hint="Delay before re-scanning after a file change (ms)">
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
      </SettingRow>

      <SettingRow label="Auto-Rescan on File Change" hint="Automatically trigger a scan when project files change">
        <Toggle checked={config.autoRescan} onChange={v => update({ autoRescan: v })} />
      </SettingRow>

      <div style={{ paddingTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => void save()} disabled={!dirty || saving} className={dirty ? "btn btn-primary" : "btn"}>
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saved && <span style={{ fontSize: 11, color: "var(--accent)" }}>Saved</span>}
      </div>
    </div>
  );
}
