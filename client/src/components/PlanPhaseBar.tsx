import { Search, FileText, Zap } from "lucide-react";

type PlanPhase = 1 | 2 | 3;

interface PlanPhaseBarProps {
  phase: PlanPhase;
  running: boolean;
  onExecute?: () => void;
}

const phases = [
  { num: 1 as const, icon: Search, label: "Exploring", doneLabel: "Explored" },
  { num: 2 as const, icon: FileText, label: "Planning", doneLabel: "Planned" },
  { num: 3 as const, icon: Zap, label: "Ready", doneLabel: "Ready" },
];

export default function PlanPhaseBar({ phase, running, onExecute }: PlanPhaseBarProps) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
      padding: "12px 14px",
      background: "var(--bg-2)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <span style={{
          fontSize: 9,
          color: "var(--text-dimmer)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          Explore workflow
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {phases.map((p, i) => {
          const Icon = p.icon;
          const isActive = p.num === phase;
          const isDone = p.num < phase;
          const isPending = p.num > phase;

          const color = isActive
            ? "var(--cyan)"
            : isDone
              ? "var(--accent)"
              : "var(--text-dimmer)";

          const bg = isActive
            ? "var(--cyan-bg)"
            : isDone
              ? "var(--accent-bg)"
              : "transparent";

          const borderColor = isActive
            ? "var(--cyan)"
            : isDone
              ? "var(--accent)"
              : "var(--border-dim)";

          return (
            <div key={p.num} style={{ display: "flex", alignItems: "center", flex: i < phases.length - 1 ? 1 : undefined }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                background: bg,
                border: `1px solid ${borderColor}`,
                borderRadius: "var(--radius)",
                transition: "all 0.2s",
              }}>
                <Icon
                  size={12}
                  style={{
                    color,
                    animation: isActive && running ? "run-pulse 1s ease-in-out infinite" : undefined,
                  }}
                />
                <span style={{
                  fontSize: 10,
                  fontFamily: "var(--font)",
                  color,
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                }}>
                  {isDone ? p.doneLabel : p.label}
                </span>
                {isActive && running && (
                  <span style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "var(--cyan)",
                    animation: "run-pulse 1s ease-in-out infinite",
                    flexShrink: 0,
                  }} />
                )}
              </div>

              {i < phases.length - 1 && (
                <div style={{
                  flex: 1,
                  height: 1,
                  minWidth: 12,
                  background: isDone ? "var(--accent)" : "var(--border-dim)",
                  transition: "background 0.2s",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {phase === 3 && !running && onExecute && (
        <button
          className="btn btn-primary btn-sm"
          onClick={onExecute}
          style={{
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Zap size={12} />
          Execute this plan
        </button>
      )}
    </div>
  );
}

export function extractPlanSummary(output: string): string {
  const lines = output.split("\n");
  let planStart = -1;
  let planEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (planStart === -1 && /^##\s*(Plan|Recommendations?|Implementation|Approach|Strategy|Steps)/i.test(line)) {
      planStart = i;
      continue;
    }
    if (planStart !== -1 && i > planStart && /^##\s/.test(line) && !/^###/.test(line)) {
      planEnd = i;
      break;
    }
  }

  if (planStart !== -1) {
    return lines.slice(planStart, planEnd).join("\n").trim();
  }

  const meaningful = lines.filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (t.startsWith("[") && t.includes("]")) return false;
    if (t.startsWith("---")) return false;
    return true;
  });

  return meaningful.slice(-20).join("\n").trim();
}

export function detectPlanPhaseTransition(output: string, currentPhase: PlanPhase): PlanPhase {
  if (currentPhase >= 2) return currentPhase;

  if (/^##\s*(Plan|Recommendations?|Implementation|Approach|Strategy|Steps)/im.test(output)) {
    return 2;
  }

  if (output.length > 2000) {
    return 2;
  }

  return currentPhase;
}
