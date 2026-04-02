import { useState } from "react";

export interface ToolEventData {
  id: string;
  tool: string;
  target: string;
  status: "running" | "complete" | "error";
  startedAt: number;
  elapsed: number;
  linesAdded?: number;
  linesRemoved?: number;
  output?: string;
}

const TOOL_COLORS: Record<string, string> = {
  Read: "var(--tool-read, var(--blue))",
  Edit: "var(--tool-edit, var(--yellow))",
  Write: "var(--tool-write, var(--green))",
  Bash: "var(--tool-bash, var(--orange))",
  Glob: "var(--tool-search, var(--text-dimmer))",
  Grep: "var(--tool-search, var(--text-dimmer))",
  WebFetch: "var(--tool-web, var(--cyan))",
  WebSearch: "var(--tool-web, var(--cyan))",
  Agent: "var(--tool-agent, var(--purple))",
};

function fmtElapsed(s: number): string {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}m ${sec}s`;
}

export default function ToolEvent({ event }: { event: ToolEventData }) {
  const [expanded, setExpanded] = useState(false);
  const color = TOOL_COLORS[event.tool] ?? "var(--text-dim)";
  const dotColor = event.status === "error" ? "var(--red)" : event.status === "running" ? "var(--accent)" : "var(--green)";

  return (
    <div>
      <div className="tool-event" onClick={() => event.output && setExpanded(!expanded)}>
        <span
          className={`tool-event-dot${event.status === "running" ? " running" : ""}`}
          style={{ background: dotColor }}
        />
        <span className="tool-event-name" style={{ color }}>{event.tool}</span>
        <span className="tool-event-target" title={event.target}>
          {event.target.split("/").pop() || event.target.slice(0, 60)}
        </span>
        <span className="tool-event-time">
          {event.status === "running" ? fmtElapsed(event.elapsed) : event.status === "complete" ? fmtElapsed(event.elapsed) : "err"}
        </span>
      </div>
      {event.linesAdded != null && (
        <div className="tool-event-detail">
          <span style={{ color: "var(--green)" }}>+{event.linesAdded}</span>
          {" "}
          <span style={{ color: "var(--red)" }}>-{event.linesRemoved ?? 0}</span>
        </div>
      )}
      {expanded && event.output && (
        <div className="tool-event-detail">
          <div className="tool-event-output">{event.output}</div>
        </div>
      )}
    </div>
  );
}
