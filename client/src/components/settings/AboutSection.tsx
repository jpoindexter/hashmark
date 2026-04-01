import { useState, useEffect } from "react";
import Toggle from "../shared/Toggle";
import { fetchApi } from "../../lib/api";
import { toast } from "../../hooks/useToast";
import { SectionView, SettingRow, ReadonlyField, InfoNote } from "./SettingsPrimitives";

interface DetectedCLI {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  path?: string;
}

interface InfoData {
  projectName: string;
  projectDir: string;
  nodeVersion?: string;
  port?: number;
}

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

export function StudioSection({ info, detectedCLIs }: { info: InfoData | null; detectedCLIs: DetectedCLI[] }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <SectionView title="About Studio" description="Version information and diagnostic details.">
      <ReadonlyField label="Version" value="0.1.0" mono />
      <ReadonlyField label="Runtime" value="Tauri + Vite + React" />
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
          {([
            ["Changelog", "https://github.com/jpoindexter/hashmark/releases"],
            ["Docs", "https://hashmark.md"],
            ["Feedback", "https://github.com/jpoindexter/hashmark/issues"],
          ] as const).map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noreferrer" className="btn btn-sm">
              {label} \u2197
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
            \u25B6
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
  );
}

export function ExperimentalSection() {
  const [skipPerms, setSkipPerms] = useState<boolean>(false);
  const [planMode, setPlanMode] = useState<boolean>(() => restore("planMode", false));
  const [multiAgent, setMultiAgent] = useState<boolean>(() => restore("multi_agent", false));
  const [betaFeatures, setBetaFeatures] = useState<boolean>(() => restore("beta_features", false));

  useEffect(() => {
    fetchApi("/api/settings/studio").then(r => r.json()).then((d: { dangerousSkipPermissions: boolean }) => {
      setSkipPerms(d.dangerousSkipPermissions ?? false);
    }).catch(() => {});
  }, []);

  useEffect(() => { persist("planMode", planMode); dispatch("planMode", planMode); }, [planMode]);
  useEffect(() => { persist("multi_agent", multiAgent); dispatch("multi_agent", multiAgent); }, [multiAgent]);
  useEffect(() => { persist("beta_features", betaFeatures); dispatch("beta_features", betaFeatures); }, [betaFeatures]);

  return (
    <SectionView title="Experimental" description="Features in active development. May be unstable or change without notice.">
      <InfoNote variant="warning">
        Experimental features can break things. Use at your own risk.
      </InfoNote>
      <SettingRow
        label="Skip Permission Prompts"
        hint="Sets CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1 on all Claude subprocesses. Applies to Chat, Run, Swarm, and Company modes."
      >
        <Toggle
          checked={skipPerms}
          onChange={(v) => {
            setSkipPerms(v);
            fetchApi("/api/settings/studio", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dangerousSkipPermissions: v }),
            }).catch(() => {
              toast.error("Failed to save setting");
            });
          }}
        />
      </SettingRow>
      {skipPerms && (
        <InfoNote variant="warning">
          Permission prompts are disabled. Claude can read, write, and execute without asking. Only enable this if you understand the risks.
        </InfoNote>
      )}
      <SettingRow label="Plan Mode" hint="Chat responds with plans only -- no code generation">
        <Toggle checked={planMode} onChange={setPlanMode} />
      </SettingRow>
      <SettingRow label="Multi-Agent" hint="Run multiple agent sessions in parallel (experimental)">
        <Toggle checked={multiAgent} onChange={setMultiAgent} />
      </SettingRow>
      <SettingRow label="Beta Features" hint="Enable unreleased features as they become available">
        <Toggle checked={betaFeatures} onChange={setBetaFeatures} />
      </SettingRow>
    </SectionView>
  );
}
