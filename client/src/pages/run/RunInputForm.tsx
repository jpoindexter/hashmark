import { useRef, useEffect, useState } from "react";
import { Search, Zap } from "lucide-react";
import AgentPicker from "../../components/AgentPicker.tsx";
import PermissionSelector from "../../components/PermissionSelector.tsx";
import type { AgentDef, RunMode } from "./types";
import { deptColor, estimateTokens, loadRecent, groupAgents } from "./types";

interface RunInputFormProps {
  task: string;
  setTask: (v: string) => void;
  agentId: string;
  setAgentId: (v: string) => void;
  agents: AgentDef[];
  mode: RunMode;
  setMode: (v: RunMode) => void;
  onRun: () => void;
}

export default function RunInputForm({
  task, setTask, agentId, setAgentId, agents, mode, setMode, onRun,
}: RunInputFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recentRef = useRef<HTMLDivElement>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [recentTasks, setRecentTasks] = useState<string[]>([]);

  useEffect(() => {
    setRecentTasks(loadRecent());
  }, []);

  useEffect(() => {
    if (!showRecent) return;
    function onDown(e: MouseEvent) {
      if (recentRef.current && !recentRef.current.contains(e.target as Node)) {
        setShowRecent(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showRecent]);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  const selectedAgent = agents.find((a) => a.id === agentId);
  const tokenEst = estimateTokens(task);
  const grouped = groupAgents(agents);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ position: "relative" }} ref={recentRef}>
        <textarea
          ref={textareaRef}
          value={task}
          onChange={(e) => { setTask(e.target.value); resizeTextarea(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) onRun(); }}
          onFocus={() => {
            if (recentTasks.length > 0) setShowRecent(true);
            if (textareaRef.current) textareaRef.current.style.borderColor = "var(--accent)";
          }}
          onBlur={(e) => {
            if (textareaRef.current) textareaRef.current.style.borderColor = "var(--border-dim)";
            setTimeout(() => {
              if (!recentRef.current?.contains(document.activeElement)) setShowRecent(false);
            }, 150);
            void e;
          }}
          placeholder="Describe the task — e.g. Add input validation to the signup form..."
          style={{
            width: "100%",
            minHeight: 80,
            padding: "12px 14px",
            background: "var(--bg-2)",
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius)",
            color: "var(--text)",
            fontFamily: "var(--font)",
            fontSize: 12,
            lineHeight: 1.6,
            resize: "none",
            outline: "none",
            display: "block",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        />

        {showRecent && recentTasks.length > 0 && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            zIndex: 50,
            overflow: "hidden",
            boxShadow: "var(--shadow-md)",
          }}>
            <div style={{
              padding: "4px 10px",
              fontSize: 9,
              color: "var(--text-dimmer)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              borderBottom: "1px solid var(--border-dim)",
            }}>
              Recent tasks
            </div>
            {recentTasks.map((t, i) => (
              <button
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setTask(t);
                  setShowRecent(false);
                  setTimeout(resizeTextarea, 0);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  background: "none",
                  border: "none",
                  borderBottom: i < recentTasks.length - 1 ? "1px solid var(--border-dim)" : "none",
                  color: "var(--text-dim)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  cursor: "pointer",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-4)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 2 }}>
        <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
          {task.length > 0 ? `~${tokenEst} tokens` : ""}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>Cmd+Enter to run</span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <AgentPicker
          agents={agents}
          selectedId={agentId}
          onSelect={setAgentId}
          grouped={grouped}
          deptColor={deptColor}
        />

        <button
          className="btn btn-primary"
          onClick={onRun}
          disabled={!task.trim()}
        >
          {"run agent"}
        </button>
      </div>

      {selectedAgent?.description && (
        <div style={{ fontSize: 11, color: "var(--text-dimmer)", paddingLeft: 2 }}>
          {selectedAgent.description}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
        {([
          { value: "plan" as RunMode, icon: <Search size={14} />, label: "Explore", sub: "Read-only analysis, no file changes" },
          { value: "build" as RunMode, icon: <Zap size={14} />, label: "Execute", sub: "Write files, commit changes" },
        ] as const).map(({ value, icon, label, sub }) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            style={{
              flex: 1,
              padding: "12px 14px",
              background: mode === value ? "rgba(63,185,80,0.07)" : "var(--bg-2)",
              border: `1.5px solid ${mode === value ? "var(--accent)" : "var(--border-dim)"}`,
              borderRadius: "var(--radius)",
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 0.12s, background 0.12s",
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: mode === value ? "var(--accent)" : "var(--text-dimmer)", display: "flex", alignItems: "center" }}>{icon}</span>
              <span style={{
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                color: mode === value ? "var(--accent)" : "var(--text)",
                fontSize: 12,
                letterSpacing: "0.01em",
              }}>
                {label}
              </span>
            </div>
            <div style={{
              fontSize: 10,
              color: "var(--text-dimmer)",
              fontFamily: "var(--font-ui)",
              lineHeight: 1.4,
            }}>
              {sub}
            </div>
          </button>
        ))}
      </div>

      <PermissionSelector />
    </div>
  );
}
