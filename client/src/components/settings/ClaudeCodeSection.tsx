import { SectionView, ReadonlyField, InfoNote } from "./SettingsPrimitives";

export default function ClaudeCodeSection() {
  return (
    <SectionView title="Claude Code" description="Configuration for the Claude CLI used to execute agent tasks.">
      <InfoNote>
        Tasks use your locally installed <code style={{ color: "var(--accent)" }}>claude</code> CLI.
        Authentication is inherited from your existing Claude account -- no API key required.
      </InfoNote>
      <ReadonlyField label="CLI Path" value="claude (from $PATH)" mono />
      <ReadonlyField label="Config Location" value="~/.claude/" mono />
      <ReadonlyField label="Auth" value="Browser auth via claude.ai -- run `claude auth` to set up" mono />
      <div style={{ marginTop: 16 }}>
        <div className="label mb-2">
          Useful Commands
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {([
            ["claude auth", "Authenticate with Claude"],
            ["claude --version", "Check CLI version"],
            ["claude --help", "Full CLI reference"],
            ["claude mcp list", "List MCP servers"],
          ] as const).map(([cmd, desc]) => (
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
  );
}
