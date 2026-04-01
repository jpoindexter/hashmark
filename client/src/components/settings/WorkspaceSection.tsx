import { useState, useEffect } from "react";
import Toggle from "../shared/Toggle";
import {
  SectionView, SettingRow, ReadonlyField, SegmentedControl, InfoNote, EmptyState,
  type EnvVar,
} from "./SettingsPrimitives";

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

export interface InfoData {
  projectName: string;
  projectDir: string;
  nodeVersion?: string;
  port?: number;
}

export function ProjectSection({ info }: { info: InfoData | null }) {
  return (
    <SectionView title="Project" description="Current workspace and project details.">
      <ReadonlyField label="Project Name" value={info?.projectName ?? "..."} />
      <ReadonlyField label="Project Directory" value={info?.projectDir ?? "..."} mono />
      <ReadonlyField label="Agents Path" value={`${info?.projectDir ?? "~"}/.claude/agents/`} mono />
      <ReadonlyField label="Claude MD" value={`${info?.projectDir ?? "~"}/CLAUDE.md`} mono />
    </SectionView>
  );
}

export function GitSection() {
  const [autoStage, setAutoStage] = useState<boolean>(() => restore("git_auto_stage", false));
  const [commitFormat, setCommitFormat] = useState<string>(() => restore("git_commit_fmt", "conventional"));
  const [showGitInNav, setShowGitInNav] = useState<boolean>(() => restore("git_in_nav", true));

  useEffect(() => { persist("git_auto_stage", autoStage); dispatch("git_auto_stage", autoStage); }, [autoStage]);
  useEffect(() => { persist("git_commit_fmt", commitFormat); dispatch("git_commit_fmt", commitFormat); }, [commitFormat]);
  useEffect(() => { persist("git_in_nav", showGitInNav); dispatch("git_in_nav", showGitInNav); }, [showGitInNav]);

  return (
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
  );
}

export function EnvSection({ envVars }: { envVars: EnvVar[] }) {
  return (
    <SectionView title="Environment" description="Environment variables visible to studio. Read from .env / .env.local -- never editable here.">
      {envVars.length === 0 ? (
        <EmptyState
          icon="\u2298"
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
  );
}

export function WorkspaceSetupSection({ info }: { info: InfoData | null }) {
  return (
    <SectionView title="Workspace" description="Setup scripts and run commands for this project.">
      <InfoNote>
        Configure setup and run commands in <code style={{ color: "var(--accent)" }}>.hashmark/workspace.json</code> or use the{" "}
        <a href="/setup" style={{ color: "var(--blue)" }}>Workspace Setup</a> page for a guided experience.
      </InfoNote>
      <SettingRow label="Setup Script" hint="Runs once on workspace init (e.g. npm install)" vertical>
        <ReadonlyField label="" value={`${info?.projectDir ?? "~"}/.hashmark/workspace.json`} mono />
      </SettingRow>
    </SectionView>
  );
}
