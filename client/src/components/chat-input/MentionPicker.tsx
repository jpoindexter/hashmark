import { useState, useEffect } from "react";
import { fetchApi } from "../../lib/api";
import {
  PICKER_CONTAINER_STYLE,
  PICKER_GROUP_LABEL_STYLE,
  pickerRowStyle,
  usePicker,
} from "./picker-shared";
import { PickerFooter } from "./PickerFooter";

export interface FileEntry {
  name: string;
  path: string;
  ext?: string;
}

export interface AgentEntry {
  id: string;
  name: string;
  description?: string;
  department?: string;
}

export function useMentionFiles() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  useEffect(() => {
    fetchApi("/api/files/list")
      .then(r => r.json())
      .then((d: { files?: FileEntry[] }) => setFiles(d.files ?? []))
      .catch(() => {});
  }, []);
  return files;
}

export function useMentionAgents() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  useEffect(() => {
    fetchApi("/api/agents")
      .then(r => r.json())
      .then((d: { agents?: AgentEntry[] }) => setAgents(d.agents ?? []))
      .catch(() => {});
  }, []);
  return agents;
}

const EXT_COLORS: Record<string, string> = {
  ts: "var(--blue)", tsx: "var(--blue)", js: "var(--yellow)", jsx: "var(--yellow)",
  py: "var(--accent)", go: "#00add8", rs: "#dea584", md: "var(--text-dim)",
  json: "var(--text-dim)", css: "#264de4", html: "#e34c26",
};

type MentionItem = { kind: "agent"; agent: AgentEntry } | { kind: "file"; file: FileEntry };

export function MentionPicker({
  query, files, agents, onSelect, onSelectAgent, onDismiss,
}: {
  query: string;
  files: FileEntry[];
  agents?: AgentEntry[];
  onSelect: (file: FileEntry) => void;
  onSelectAgent?: (agent: AgentEntry) => void;
  onDismiss: () => void;
}) {
  const q = query.toLowerCase();

  const filteredAgents = agents
    ? (q
        ? agents.filter(a => a.name.toLowerCase().includes(q) || (a.department ?? "").toLowerCase().includes(q))
        : agents.slice(0, 5))
    : [];

  const filteredFiles = q
    ? files.filter(f => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
    : files.slice(0, 15);

  const items: MentionItem[] = [
    ...filteredAgents.map(a => ({ kind: "agent" as const, agent: a })),
    ...filteredFiles.map(f => ({ kind: "file" as const, file: f })),
  ];

  const handleSelect = (item: MentionItem) => {
    if (item.kind === "agent" && onSelectAgent) onSelectAgent(item.agent);
    else if (item.kind === "file") onSelect(item.file);
  };

  const { activeIdx, setActiveIdx, listRef } = usePicker(query, items, handleSelect, onDismiss);

  if (items.length === 0) return null;

  let agentsSectionRendered = false;
  let filesSectionRendered = false;

  return (
    <div ref={listRef} style={{ ...PICKER_CONTAINER_STYLE, maxHeight: 320 }}>
      {items.map((item, idx) => {
        const isActive = idx === activeIdx;
        const nodes: React.ReactNode[] = [];

        if (item.kind === "agent" && !agentsSectionRendered) {
          agentsSectionRendered = true;
          nodes.push(<div key="agents-label" style={PICKER_GROUP_LABEL_STYLE}>Agents</div>);
        }
        if (item.kind === "file" && !filesSectionRendered) {
          filesSectionRendered = true;
          nodes.push(<div key="files-label" style={PICKER_GROUP_LABEL_STYLE}>Files</div>);
        }

        if (item.kind === "agent") {
          nodes.push(
            <div
              key={`agent-${item.agent.id}`}
              data-active={isActive}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setActiveIdx(idx)}
              style={{ ...pickerRowStyle(isActive), gap: 8, padding: "5px 12px" }}
            >
              <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--accent)", flexShrink: 0 }}>@</span>
              <span style={{ fontFamily: "var(--font)", fontSize: 12, color: isActive ? "var(--text)" : "var(--accent)", fontWeight: 600, flexShrink: 0 }}>
                {item.agent.name}
              </span>
              {item.agent.description && (
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.agent.description}
                </span>
              )}
            </div>
          );
        } else {
          const file = item.file;
          const color = file.ext ? (EXT_COLORS[file.ext] ?? "var(--text-dimmer)") : "var(--text-dimmer)";
          const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/") + 1) : "";
          nodes.push(
            <div
              key={file.path}
              data-active={isActive}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setActiveIdx(idx)}
              style={{ ...pickerRowStyle(isActive), gap: 8, padding: "5px 12px" }}
            >
              <span style={{ fontFamily: "var(--font)", fontSize: 10, fontWeight: 600, color, minWidth: 22, textAlign: "center", flexShrink: 0 }}>
                {file.ext ? file.ext.toUpperCase().slice(0, 2) : "  "}
              </span>
              <span style={{ fontFamily: "var(--font)", fontSize: 12, color: isActive ? "var(--text)" : "var(--text-dim)", flexShrink: 0 }}>
                {file.name}
              </span>
              {dir && (
                <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {dir}
                </span>
              )}
            </div>
          );
        }

        return nodes;
      })}
      <PickerFooter />
    </div>
  );
}

export function getAtQuery(val: string, cursorPos: number): string | null {
  const before = val.slice(0, cursorPos);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  const segment = before.slice(atIdx + 1);
  if (segment.includes(" ") || segment.includes("\n")) return null;
  return segment;
}
