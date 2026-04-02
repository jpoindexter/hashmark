import { useMemo } from "react";
import { renderInline } from "../../lib/markdown";
import type { RunStatus } from "./types";

type Segment =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "code"; lang: string; content: string }
  | { type: "list"; items: string[] }
  | { type: "para"; text: string }
  | { type: "tool_event"; tool: string; detail: string };

const TOOL_PATTERNS: Array<{ re: RegExp; tool: string }> = [
  { re: /^(?:Bash|Running bash|Executing)\s*[:：]\s*(.+)/i, tool: "Bash" },
  { re: /^(?:Read(?:ing)?(?: file)?)\s*[:：]\s*(.+)/i, tool: "Read" },
  { re: /^(?:Writ(?:e|ing)(?: to)?)\s*[:：]\s*(.+)/i, tool: "Write" },
  { re: /^(?:Edit(?:ing)?)\s*[:：]\s*(.+)/i, tool: "Edit" },
  { re: /^(?:Glob(?:bing)?|Find(?:ing)? files?)\s*[:：]\s*(.+)/i, tool: "Glob" },
  { re: /^(?:Grep(?:ping)?|Search(?:ing)? (?:for )?files?)\s*[:：]\s*(.+)/i, tool: "Grep" },
];

export function useSegments(output: string): Segment[] {
  return useMemo((): Segment[] => {
    if (!output) return [];
    const result: Segment[] = [];
    const lines = output.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith("```")) {
        const lang = line.slice(3).trim() || "text";
        const contentLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) { contentLines.push(lines[i]); i++; }
        result.push({ type: "code", lang, content: contentLines.join("\n") });
        i++; continue;
      }
      const h3 = line.match(/^###\s+(.*)/);
      if (h3) { result.push({ type: "h3", text: h3[1] }); i++; continue; }
      const h2 = line.match(/^##\s+(.*)/);
      if (h2) { result.push({ type: "h2", text: h2[1] }); i++; continue; }
      const h1 = line.match(/^#\s+(.*)/);
      if (h1) { result.push({ type: "h1", text: h1[1] }); i++; continue; }
      if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
        const items: string[] = [];
        while (i < lines.length && (lines[i].match(/^[-*]\s+/) || lines[i].match(/^\d+\.\s+/))) {
          items.push(lines[i].replace(/^[-*\d.]+\s+/, "")); i++;
        }
        result.push({ type: "list", items }); continue;
      }
      if (!line.trim()) { i++; continue; }
      const toolMatch = TOOL_PATTERNS.reduce<{ tool: string; detail: string } | null>((found, p) => {
        if (found) return found;
        const m = line.match(p.re);
        return m ? { tool: p.tool, detail: m[1].trim().slice(0, 120) } : null;
      }, null);
      if (toolMatch) { result.push({ type: "tool_event", tool: toolMatch.tool, detail: toolMatch.detail }); i++; continue; }
      const paraLines: string[] = [];
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !lines[i].match(/^[-*]\s+/) && !lines[i].match(/^\d+\.\s+/)) {
        paraLines.push(lines[i]); i++;
      }
      if (paraLines.length) result.push({ type: "para", text: paraLines.join(" ") });
    }
    return result;
  }, [output]);
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  idle:        { label: "IDLE",        color: "var(--text-dimmer)" },
  starting:    { label: "STARTING",    color: "var(--accent)" },
  running:     { label: "RUNNING",     color: "var(--accent)" },
  done:        { label: "DONE",        color: "var(--accent)" },
  error:       { label: "ERROR",       color: "var(--red)" },
  stopped:     { label: "STOPPED",     color: "var(--yellow)" },
  interrupted: { label: "INTERRUPTED", color: "var(--yellow)" },
};

export function RunMetaStrip({ runMeta, runStatus, currentModel, running, loopDetected, failureClass }: {
  runMeta: { startedAt: number; durationMs?: number; wordCount?: number } | null;
  runStatus: RunStatus; currentModel: { label: string }; running: boolean;
  loopDetected: { count: number; pattern: string } | null;
  failureClass: { label: string; color: string; detail: string } | null;
}) {
  if (!runMeta) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "6px 16px",
      borderBottom: "1px solid var(--border-dim)", fontSize: 10, fontFamily: "var(--font)",
      color: "var(--text-dimmer)", background: "var(--bg-2)", flexShrink: 0,
    }}>
      <span style={{ color: STATUS_BADGE[runStatus]?.color ?? "var(--text-dimmer)", fontWeight: 600, letterSpacing: "0.08em" }}>
        {STATUS_BADGE[runStatus]?.label}
      </span>
      <span>·</span>
      <span>{currentModel.label}</span>
      {runMeta.durationMs != null && (<><span>·</span><span>{(runMeta.durationMs / 1000).toFixed(1)}s</span></>)}
      {runMeta.wordCount != null && (<><span>·</span><span>{runMeta.wordCount.toLocaleString()} words</span></>)}
      {running && !loopDetected && <span style={{ color: "var(--accent)", marginLeft: "auto" }}>● streaming</span>}
      {running && loopDetected && (
        <span style={{ color: "var(--yellow)", marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>⟳ LOOP ×{loopDetected.count}</span>
          {loopDetected.count >= 3 && <span style={{ opacity: 0.7 }}>— auto-stopped</span>}
        </span>
      )}
      {!running && failureClass && (
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: failureClass.color, fontWeight: 600, letterSpacing: "0.08em" }}>{failureClass.label}</span>
          <span style={{ color: "var(--text-dimmer)" }}>—</span>
          <span style={{ color: "var(--text-dimmer)" }}>{failureClass.detail}</span>
        </span>
      )}
    </div>
  );
}

export function StructuredOutput({ segments, running, output, runStatus }: {
  segments: Segment[]; running: boolean; output: string; runStatus: RunStatus;
}) {
  return (
    <div style={{ flex: 1, padding: "16px 20px", overflow: "auto" }}>
      {running && !output && (
        <div style={{ color: "var(--text-dimmer)", fontSize: "11px" }}>
          <span style={{ color: "var(--accent)" }}>●</span> Running...
        </div>
      )}
      {segments.length > 0 && segments.map((seg, idx) => {
        if (seg.type === "h1") return (
          <div key={idx} style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8, marginTop: idx > 0 ? 20 : 0, paddingBottom: 6, borderBottom: "1px solid var(--border-dim)", fontFamily: "var(--font-ui, var(--font))" }}>{seg.text}</div>
        );
        if (seg.type === "h2") return (
          <div key={idx} className="label" style={{ fontSize: 12, color: "var(--text)", marginBottom: 6, marginTop: idx > 0 ? 16 : 0 }}>{seg.text}</div>
        );
        if (seg.type === "h3") return (
          <div key={idx} style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", marginBottom: 4, marginTop: idx > 0 ? 12 : 0, fontFamily: "var(--font)" }}>{seg.text}</div>
        );
        if (seg.type === "code") return (
          <div key={idx} style={{ background: "var(--bg-3)", border: "1px solid var(--border-dim)", borderRadius: 2, margin: "10px 0" }}>
            {seg.lang !== "text" && (
              <div className="text-micro" style={{ padding: "3px 10px", borderBottom: "1px solid var(--border-dim)", fontFamily: "var(--font)" }}>{seg.lang}</div>
            )}
            <pre style={{ margin: 0, padding: "10px 12px", fontSize: 11, lineHeight: "1.55", color: "var(--text)", fontFamily: "var(--font)", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowX: "auto" }}>{seg.content}</pre>
          </div>
        );
        if (seg.type === "list") return (
          <ul key={idx} style={{ margin: "6px 0", paddingLeft: 0, listStyle: "none" }}>
            {seg.items.map((item, ii) => (
              <li key={ii} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, lineHeight: "1.55", color: "var(--text-dim)", fontFamily: "var(--font-ui, var(--font))", marginBottom: 3 }}>
                <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}>›</span>
                <span>{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        );
        if (seg.type === "para") return (
          <p key={idx} style={{ margin: "0 0 8px", fontSize: 12, lineHeight: "1.65", color: "var(--text-dim)", fontFamily: "var(--font-ui, var(--font))" }}>{renderInline(seg.text)}</p>
        );
        if (seg.type === "tool_event") return (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 8px", background: "rgba(56,139,253,0.06)", border: "1px solid rgba(56,139,253,0.18)", borderRadius: 2, margin: "3px 0" }}>
            <span style={{ color: "var(--blue)", fontWeight: 600, fontSize: 9, letterSpacing: "0.08em", fontFamily: "var(--font)", flexShrink: 0 }}>{seg.tool}</span>
            <span style={{ color: "var(--text-dimmer)", fontSize: 10, fontFamily: "var(--font)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.detail}</span>
          </div>
        );
        return null;
      })}
      {running && output && <span style={{ color: "var(--accent)", fontSize: 12 }}>▋</span>}
      {!running && !output && runStatus === "idle" && (
        <div style={{ color: "var(--text-dimmer)", fontSize: "11px" }}>Output will appear here.</div>
      )}
    </div>
  );
}
