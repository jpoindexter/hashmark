import { SkeletonCard } from "../shared/Skeleton";
import { SectionView, EmptyState } from "./SettingsPrimitives";

interface McpServer {
  command: string;
  source: string;
}

export interface McpConfigData {
  sources: Array<{ path: string; exists: boolean; serverCount: number; label: string }>;
  servers: Record<string, McpServer>;
}

export default function McpSection({ mcpConfig }: { mcpConfig: McpConfigData | null }) {
  return (
    <SectionView title="MCP Servers" description="Model Context Protocol servers injected into Claude sessions.">
      {!mcpConfig ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[1, 2].map(i => <SkeletonCard key={i} height={40} />)}
        </div>
      ) : Object.keys(mcpConfig.servers).length === 0 ? (
        <EmptyState
          icon="\u2295"
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
                <span className="text-micro" style={{
                  whiteSpace: "nowrap",
                  color: server.source === "project" ? "var(--accent)" : undefined,
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
          <div className="label mb-2">
            Config Sources
          </div>
          {mcpConfig.sources.map(s => (
            <div key={s.path} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 0", borderBottom: "1px solid var(--border-dim)", fontSize: 11,
            }}>
              <code style={{ color: "var(--text-dim)", fontFamily: "var(--font)" }}>{s.path}</code>
              <span style={{ color: s.exists ? "var(--accent)" : "var(--text-dimmer)", fontSize: 10 }}>
                {s.exists ? `${s.serverCount} server${s.serverCount !== 1 ? "s" : ""}` : "not found"}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionView>
  );
}
