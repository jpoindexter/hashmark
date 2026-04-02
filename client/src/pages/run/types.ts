import { useState, useRef, useEffect } from "react";
import { DEPT_COLORS } from "../../lib/constants";

export interface AgentDef {
  id: string;
  name: string;
  description: string;
}

export type RunPhase = "idle" | "running" | "done" | "lost";

export type RunMode = "plan" | "build";

export interface RunResult {
  hasChanges: boolean;
  conflictBranch?: string;
  mode?: RunMode;
  runId?: string;
  worktreeBranch?: string;
  readyToMerge?: { branch: string; filesChanged: number };
  merged?: boolean;
}

export function deptFromId(id: string): string {
  const seg = id.split("-")[0].toLowerCase();
  return DEPT_COLORS[seg] ? seg : "general";
}

export function deptColor(id: string): string {
  return DEPT_COLORS[deptFromId(id)] ?? DEPT_COLORS.general;
}

const RECENT_KEY = "studio:run:recent-tasks";
const MAX_RECENT = 10;

export function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch { return []; }
}

export function saveRecent(task: string) {
  const prev = loadRecent().filter((t) => t !== task);
  const next = [task, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function estimateTokens(text: string): number {
  return Math.max(0, Math.round(text.length / 4));
}

export function useElapsed(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      startRef.current = Date.now();
      setElapsed(0);
      const id = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
      }, 1000);
      return () => clearInterval(id);
    } else {
      startRef.current = null;
    }
  }, [active]);

  return elapsed;
}

export function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function groupAgents(agents: AgentDef[]): Map<string, AgentDef[]> {
  const map = new Map<string, AgentDef[]>();
  for (const a of agents) {
    const dept = deptFromId(a.id);
    const label = dept.charAt(0).toUpperCase() + dept.slice(1);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(a);
  }
  return map;
}
