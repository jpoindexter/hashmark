import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Rocket, Terminal, Users, FileText, ArrowRight } from "lucide-react";

const ONBOARDED_KEY = "studio:onboarded";

const TEMPLATE_TASKS = [
  { label: "Fix all TypeScript errors", task: "Fix all TypeScript errors" },
  { label: "Add input validation to API routes", task: "Add input validation to API routes" },
  { label: "Write missing unit tests", task: "Write missing unit tests" },
];

export function isOnboarded(): boolean {
  return !!localStorage.getItem(ONBOARDED_KEY);
}

export function markOnboarded(): void {
  localStorage.setItem(ONBOARDED_KEY, "true");
}

export default function Welcome({ onDismiss }: { onDismiss: () => void }) {
  const navigate = useNavigate();
  const [hoveredTask, setHoveredTask] = useState<number | null>(null);
  const [gotItHover, setGotItHover] = useState(false);

  const dismiss = () => {
    markOnboarded();
    onDismiss();
  };

  const goToRun = (task: string) => {
    markOnboarded();
    navigate(`/run?task=${encodeURIComponent(task)}`);
  };

  const sectionLabel: React.CSSProperties = {
    fontFamily: "var(--font)",
    fontSize: 10,
    color: "var(--text-dimmer)",
    letterSpacing: "0.06em",
    marginBottom: 10,
    textTransform: "uppercase",
  };

  const listItem: React.CSSProperties = {
    fontFamily: "var(--font)",
    fontSize: 11,
    color: "var(--text-dim)",
    lineHeight: 1.7,
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: 24,
      marginBottom: 28,
    }}>
      <div style={{
        fontFamily: "var(--font)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text)",
        marginBottom: 4,
        letterSpacing: "0.02em",
      }}>
        welcome to hashmark studio
      </div>
      <div style={{
        fontFamily: "var(--font)",
        fontSize: 11,
        color: "var(--text-dim)",
        marginBottom: 20,
      }}>
        AI agent orchestration for your codebase.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        {/* What you can do */}
        <div>
          <div style={sectionLabel}>what you can do</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={listItem}>
              <Rocket size={12} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />
              Chat with Claude about your code (Sessions)
            </div>
            <div style={listItem}>
              <Terminal size={12} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />
              Run agents on tasks with git safety (Run)
            </div>
            <div style={listItem}>
              <Users size={12} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />
              Dispatch multiple agents in parallel (Swarm)
            </div>
            <div style={listItem}>
              <FileText size={12} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />
              Generate AI context files (Generate)
            </div>
          </div>
        </div>

        {/* Quick start */}
        <div>
          <div style={sectionLabel}>quick start</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={listItem}>
              <span style={{ color: "var(--text-dimmer)", fontWeight: 600, width: 14, textAlign: "center", flexShrink: 0 }}>1</span>
              Click "+ new mission" to start a chat
            </div>
            <div style={listItem}>
              <span style={{ color: "var(--text-dimmer)", fontWeight: 600, width: 14, textAlign: "center", flexShrink: 0 }}>2</span>
              Or go to Run to dispatch an agent on a task
            </div>
          </div>
          <div style={{
            fontFamily: "var(--font)",
            fontSize: 10,
            color: "var(--text-dimmer)",
            marginTop: 14,
            lineHeight: 1.5,
          }}>
            Requires Claude CLI installed
          </div>
        </div>
      </div>

      {/* Template tasks */}
      <div style={{ marginBottom: 20 }}>
        <div style={sectionLabel}>try a task</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TEMPLATE_TASKS.map((t, i) => (
            <button
              key={i}
              onClick={() => goToRun(t.task)}
              onMouseEnter={() => setHoveredTask(i)}
              onMouseLeave={() => setHoveredTask(null)}
              style={{
                fontFamily: "var(--font)",
                fontSize: 11,
                padding: "6px 12px",
                background: hoveredTask === i ? "var(--accent-bg)" : "var(--bg)",
                border: `1px solid ${hoveredTask === i ? "var(--accent-border)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                color: hoveredTask === i ? "var(--text)" : "var(--text-dim)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.1s",
              }}
            >
              {t.label}
              <ArrowRight size={12} style={{ opacity: hoveredTask === i ? 1 : 0, transition: "opacity 0.1s" }} />
            </button>
          ))}
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        onMouseEnter={() => setGotItHover(true)}
        onMouseLeave={() => setGotItHover(false)}
        style={{
          fontFamily: "var(--font)",
          fontSize: 11,
          padding: "7px 18px",
          fontWeight: 600,
          background: gotItHover ? "var(--accent)" : "var(--surface-2)",
          border: `1px solid ${gotItHover ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "var(--radius)",
          color: gotItHover ? "var(--color-on-accent)" : "var(--text-dim)",
          cursor: "pointer",
          transition: "all 0.1s",
        }}
      >
        got it
      </button>
    </div>
  );
}
