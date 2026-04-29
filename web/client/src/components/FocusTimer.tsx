import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import type { Session } from "../types";

// ── Types ──────────────────────────────────────────────────────────────────────

type TimerMode = "focus" | "short_break" | "long_break" | "custom";
type AmbientSound = "none" | "whitenoise" | "hum" | "rain";
type MainTab = "timer" | "report";

interface TimerSession {
  id: string;
  mode: TimerMode;
  durationMin: number;
  completedAt: number;
  interrupted: boolean;
  label?: string;
}

interface DailyGoals {
  focusSessions: number;
  focusMinutes: number;
}

interface StreakData {
  current: number;
  longest: number;
  lastDate: string; // YYYY-MM-DD
}

interface Project {
  id: string;
  name: string;
  color: string;
}

interface TimeEntry {
  id: string;
  projectId: string;
  date: string; // ISO
  duration: number; // seconds
  label?: string;
  pomodoroCount: number;
}

// ── LocalStorage helpers ───────────────────────────────────────────────────────

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

function lsSet(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Date utils ─────────────────────────────────────────────────────────────────

function toDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  return toDateStr(Date.now());
}

function yesterdayStr(): string {
  return toDateStr(Date.now() - 86400000);
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function getMondayOfWeek(weekOffset: number): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon + weekOffset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtHmLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// ── Audio ──────────────────────────────────────────────────────────────────────

function playDing() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close();
  } catch { /* AudioContext unavailable */ }
}

function playGoalMelody() {
  try {
    const ctx = new AudioContext();
    const notes = [523, 659, 784]; // C5 -> E5 -> G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.22;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.2);
      if (i === notes.length - 1) osc.onended = () => void ctx.close();
    });
  } catch { /* AudioContext unavailable */ }
}

// ── Ambient audio ──────────────────────────────────────────────────────────────

interface AmbientNodes {
  ctx: AudioContext;
  gainNode: GainNode;
  source?: AudioBufferSourceNode | OscillatorNode;
  filterSource?: AudioBufferSourceNode;
}

function createAmbient(type: AmbientSound, volume: number): AmbientNodes | null {
  if (type === "none") return null;
  try {
    const ctx = new AudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.connect(ctx.destination);

    if (type === "hum") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(60, ctx.currentTime);
      osc.connect(gainNode);
      osc.start();
      return { ctx, gainNode, source: osc };
    }

    const sampleRate = ctx.sampleRate;
    const bufferSize = sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    if (type === "whitenoise") {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(gainNode);
      src.start();
      return { ctx, gainNode, source: src };
    }

    if (type === "rain") {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.Q.setValueAtTime(0.5, ctx.currentTime);
      src.connect(filter);
      filter.connect(gainNode);
      src.start();
      return { ctx, gainNode, source: src };
    }

    return null;
  } catch { return null; }
}

function stopAmbient(nodes: AmbientNodes | null) {
  if (!nodes) return;
  try {
    if (nodes.source) {
      if ("stop" in nodes.source) nodes.source.stop();
      nodes.source.disconnect();
    }
    nodes.gainNode.disconnect();
    void nodes.ctx.close();
  } catch { /* ignore */ }
}

// ── Notification ───────────────────────────────────────────────────────────────

async function requestNotifPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function sendNotif(title: string, body: string) {
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}

// ── Time utils ─────────────────────────────────────────────────────────────────

function fmtMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Mode config ────────────────────────────────────────────────────────────────

const MODE_LABELS: Record<TimerMode, string> = {
  focus: "Focus",
  short_break: "Short Break",
  long_break: "Long Break",
  custom: "Custom",
};

const MODE_COLORS: Record<TimerMode, string> = {
  focus: "var(--accent)",
  short_break: "var(--success)",
  long_break: "var(--success)",
  custom: "var(--warning)",
};

const PRESET_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];

// ── Ring SVG ───────────────────────────────────────────────────────────────────

function ProgressRing({ progress, mode, running }: { progress: number; mode: TimerMode; running: boolean }) {
  const size = 160;
  const strokeWidth = 6;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(1, progress)));
  const color = MODE_COLORS[mode];

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: running ? "stroke-dashoffset 1s linear" : "stroke-dashoffset 0.3s" }}
      />
    </svg>
  );
}

// ── 7-day bar chart ────────────────────────────────────────────────────────────

function WeekChart({ sessions }: { sessions: TimerSession[] }) {
  const days = useMemo(() => {
    const today = startOfDay(Date.now());
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = today - (6 - i) * 86400000;
      const dayEnd = dayStart + 86400000;
      const count = sessions.filter(s => s.completedAt >= dayStart && s.completedAt < dayEnd && s.mode === "focus" && !s.interrupted).length;
      const label = new Date(dayStart).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
      return { label, count };
    });
  }, [sessions]);

  const maxCount = Math.max(1, ...days.map(d => d.count));
  const chartH = 48;
  const barW = 16;
  const gap = 8;
  const totalW = days.length * (barW + gap) - gap;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={totalW} height={chartH + 16} style={{ overflow: "visible" }}>
        {days.map((d, i) => {
          const barH = d.count === 0 ? 2 : Math.max(4, (d.count / maxCount) * chartH);
          const x = i * (barW + gap);
          const y = chartH - barH;
          const isToday = i === 6;
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={barW} height={barH}
                rx={3}
                fill={isToday ? "var(--accent)" : "var(--bg-elevated)"}
                stroke={isToday ? "none" : "var(--border)"}
                strokeWidth={1}
              />
              <text
                x={x + barW / 2} y={chartH + 13}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-muted)"
                fontFamily="var(--font-sans)"
              >
                {d.label}
              </text>
              {d.count > 0 && (
                <text
                  x={x + barW / 2} y={y - 3}
                  textAnchor="middle"
                  fontSize={8}
                  fill={isToday ? "var(--accent)" : "var(--text-muted)"}
                  fontFamily="var(--font-sans)"
                >
                  {d.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Streak calendar strip ──────────────────────────────────────────────────────

function StreakStrip({ activeDates }: { activeDates: string[] }) {
  const activeSet = useMemo(() => new Set(activeDates), [activeDates]);
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const ts = Date.now() - (6 - i) * 86400000;
      const dateStr = toDateStr(ts);
      const label = new Date(ts).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1);
      return { dateStr, label, active: activeSet.has(dateStr) };
    });
  }, [activeSet]);

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "center" }}>
      {days.map(({ dateStr, label, active }) => (
        <div key={dateStr} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: active ? "var(--accent)" : "var(--border)",
            border: active ? "none" : "1px solid var(--border)",
          }} />
          <span style={{ fontSize: 8, color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function GoalBar({ label, current, goal, unit }: { label: string; current: number; goal: number; unit: string }) {
  const pct = Math.min(1, goal > 0 ? current / goal : 0);
  const met = current >= goal;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
        <span style={{ fontSize: 10, color: met ? "var(--accent)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {current}{unit} / {goal}{unit}
          {met && " 🎯"}
        </span>
      </div>
      <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct * 100}%`,
          background: met ? "var(--accent)" : "var(--text-muted)",
          borderRadius: 2, transition: "width 0.3s",
        }} />
      </div>
    </div>
  );
}

// ── Project badge ──────────────────────────────────────────────────────────────

function ProjectBadge({ project }: { project: Project }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: project.color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{project.name}</span>
    </span>
  );
}

// ── Session log row ────────────────────────────────────────────────────────────

function SessionRow({
  session,
  project,
  onLabelChange,
}: {
  session: TimerSession;
  project?: Project;
  onLabelChange: (id: string, label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.label ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const modeIcons: Record<TimerMode, string> = {
    focus: "●",
    short_break: "◌",
    long_break: "◎",
    custom: "◈",
  };

  const commit = () => {
    setEditing(false);
    onLabelChange(session.id, draft.trim());
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "4px 8px",
      borderRadius: "var(--radius-sm)", fontSize: 11,
      color: session.interrupted ? "var(--text-muted)" : "var(--text)",
    }}>
      <span style={{ color: MODE_COLORS[session.mode], fontSize: 10, flexShrink: 0 }}>
        {modeIcons[session.mode]}
      </span>
      <span style={{ flexShrink: 0, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        {session.durationMin}m
      </span>
      {session.interrupted && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>interrupted</span>}
      {project && <ProjectBadge project={project} />}
      <span style={{ flex: 1, overflow: "hidden" }}>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(session.label ?? ""); } }}
            style={{
              width: "100%", background: "var(--bg-elevated)", border: "1px solid var(--accent)",
              borderRadius: 3, padding: "1px 4px", fontSize: 11, color: "var(--text)",
              outline: "none", fontFamily: "var(--font-sans)",
            }}
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            title="Click to add label"
            style={{
              cursor: "text", color: session.label ? "var(--text-secondary)" : "var(--text-muted)",
              fontStyle: session.label ? "normal" : "italic",
              display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {session.label || "add label…"}
          </span>
        )}
      </span>
      <span style={{ flexShrink: 0, color: "var(--text-muted)", fontSize: 10 }}>
        {timeAgo(session.completedAt)}
      </span>
    </div>
  );
}

// ── Project selector ───────────────────────────────────────────────────────────

function ProjectSelector({
  projects,
  selectedId,
  onSelect,
  onProjectsChange,
  timeEntries,
}: {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onProjectsChange: (projects: Project[]) => void;
  timeEntries: TimeEntry[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const todayTotals = useMemo(() => {
    const today = todayStr();
    const map: Record<string, number> = {};
    for (const e of timeEntries) {
      if (e.date.startsWith(today)) {
        map[e.projectId] = (map[e.projectId] ?? 0) + e.duration;
      }
    }
    return map;
  }, [timeEntries]);

  const addProject = () => {
    const name = newName.trim();
    if (!name) return;
    const p: Project = { id: Math.random().toString(36).slice(2), name, color: newColor };
    const next = [...projects, p];
    onProjectsChange(next);
    lsSet("hm-projects", next);
    setNewName("");
    setNewColor(PRESET_COLORS[0]);
    setShowForm(false);
    onSelect(p.id);
  };

  return (
    <div style={{ padding: "0 12px 10px", flexShrink: 0 }}>
      <select
        value={selectedId ?? ""}
        onChange={e => {
          if (e.target.value === "__add__") {
            setShowForm(true);
          } else {
            onSelect(e.target.value || null);
          }
        }}
        style={{
          width: "100%", padding: "4px 8px", fontSize: 11,
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", color: selectedId ? "var(--text)" : "var(--text-muted)",
          cursor: "pointer", fontFamily: "var(--font-sans)", outline: "none",
        }}
      >
        <option value="">Project (optional)</option>
        {projects.map(p => {
          const secs = todayTotals[p.id];
          const suffix = secs ? ` — ${fmtHm(secs)} today` : "";
          return <option key={p.id} value={p.id}>{p.name}{suffix}</option>;
        })}
        <option value="__add__">+ Add Project</option>
      </select>

      {showForm && (
        <div style={{
          marginTop: 6, padding: 10, background: "var(--bg-elevated)",
          borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <input
            autoFocus
            placeholder="Project name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addProject(); if (e.key === "Escape") setShowForm(false); }}
            style={{
              width: "100%", padding: "4px 8px", fontSize: 11,
              background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", color: "var(--text)",
              outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 16, height: 16, borderRadius: "50%", background: c,
                  border: newColor === c ? "2px solid var(--text)" : "2px solid transparent",
                  cursor: "pointer", padding: 0, flexShrink: 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={addProject}
              style={{
                flex: 1, padding: "4px 0", fontSize: 11, background: "var(--accent)",
                border: "none", borderRadius: "var(--radius-sm)", color: "white",
                cursor: "pointer", fontFamily: "var(--font-sans)",
              }}
            >
              Add
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                flex: 1, padding: "4px 0", fontSize: 11, background: "none",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Weekly report ──────────────────────────────────────────────────────────────

function WeeklyReport({
  projects,
  timeEntries,
  sessionLog,
  dailyGoals,
}: {
  projects: Project[];
  timeEntries: TimeEntry[];
  sessionLog: TimerSession[];
  dailyGoals: DailyGoals;
}) {
  const [weekOffset, setWeekOffset] = useState(0);

  const { weekStart, weekEnd, days } = useMemo(() => {
    const mon = getMondayOfWeek(weekOffset);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    const dayArr = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
    return { weekStart: mon, weekEnd: sun, days: dayArr };
  }, [weekOffset]);

  const weekLabel = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${weekStart.toLocaleDateString(undefined, opts)} – ${weekEnd.toLocaleDateString(undefined, opts)}`;
  }, [weekStart, weekEnd]);

  const weekEntries = useMemo(() =>
    timeEntries.filter(e => {
      const d = new Date(e.date);
      return d >= weekStart && d <= weekEnd;
    }), [timeEntries, weekStart, weekEnd]);

  const weekSessions = useMemo(() =>
    sessionLog.filter(s => {
      const d = new Date(s.completedAt);
      return d >= weekStart && d <= weekEnd && s.mode === "focus" && !s.interrupted;
    }), [sessionLog, weekStart, weekEnd]);

  // Time by project
  const projectTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of weekEntries) {
      map[e.projectId] = (map[e.projectId] ?? 0) + e.duration;
    }
    return Object.entries(map)
      .map(([id, secs]) => ({ id, secs, project: projects.find(p => p.id === id) }))
      .filter(x => x.project)
      .sort((a, b) => b.secs - a.secs);
  }, [weekEntries, projects]);

  const maxProjectSecs = Math.max(1, ...projectTotals.map(p => p.secs));

  // Daily breakdown per project
  const dailyData = useMemo(() => {
    return days.map(day => {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const entries = weekEntries.filter(e => {
        const d = new Date(e.date);
        return d >= dayStart && d <= dayEnd;
      });
      const byProject: Record<string, number> = {};
      for (const e of entries) {
        byProject[e.projectId] = (byProject[e.projectId] ?? 0) + e.duration;
      }
      const total = entries.reduce((acc, e) => acc + e.duration, 0);
      return { day, byProject, total };
    });
  }, [days, weekEntries]);

  const maxDaySecs = Math.max(1, ...dailyData.map(d => d.total));

  // Focus quality
  const qualityStats = useMemo(() => {
    if (weekSessions.length === 0) return null;
    const durations = weekSessions.map(s => s.durationMin * 60);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const longest = Math.max(...durations);
    const totalPomodoros = weekEntries.reduce((acc, e) => acc + e.pomodoroCount, 0);
    const interruptions = sessionLog.filter(s => {
      const d = new Date(s.completedAt);
      return d >= weekStart && d <= weekEnd && s.interrupted;
    }).length;
    return { avg, longest, totalPomodoros, interruptions };
  }, [weekSessions, weekEntries, sessionLog, weekStart, weekEnd]);

  // Goals progress: how many days goal was hit
  const goalDaysHit = useMemo(() => {
    return days.filter(day => {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const daySessions = sessionLog.filter(s => {
        const d = new Date(s.completedAt);
        return d >= dayStart && d <= dayEnd && s.mode === "focus" && !s.interrupted;
      });
      const dayMin = daySessions.reduce((acc, s) => acc + s.durationMin, 0);
      return daySessions.length >= dailyGoals.focusSessions && dayMin >= dailyGoals.focusMinutes;
    }).length;
  }, [days, sessionLog, dailyGoals]);

  const totalWeekSecs = weekEntries.reduce((acc, e) => acc + e.duration, 0);

  const exportReport = () => {
    const lines: string[] = [
      `Weekly Focus Report`,
      `${weekLabel}`,
      ``,
      `Total time: ${fmtHmLong(totalWeekSecs)}`,
      `Focus sessions: ${weekSessions.length}`,
      `Goals hit: ${goalDaysHit}/7 days`,
      ``,
      `Time by project:`,
      ...projectTotals.map(p => `  ${p.project!.name}: ${fmtHmLong(p.secs)}`),
    ];

    if (qualityStats) {
      lines.push(
        ``,
        `Focus quality:`,
        `  Avg session: ${fmtHmLong(qualityStats.avg)}`,
        `  Longest: ${fmtHmLong(qualityStats.longest)}`,
        `  Pomodoros: ${qualityStats.totalPomodoros}`,
      );
      if (qualityStats.interruptions > 0) {
        lines.push(`  Interruptions: ${qualityStats.interruptions}`);
      }
    }

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast.success("Report copied to clipboard");
    }).catch(() => {
      toast.error("Clipboard unavailable");
    });
  };

  const chartBarH = 32;
  const dayBarW = 18;
  const dayGap = 6;
  const dayChartW = days.length * (dayBarW + dayGap) - dayGap;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", padding: "10px 12px 8px",
        gap: 8, flexShrink: 0,
      }}>
        <button
          onClick={() => setWeekOffset(v => v - 1)}
          style={{
            width: 24, height: 24, background: "none", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-muted)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
          }}
        >
          ‹
        </button>
        <span style={{ flex: 1, textAlign: "center", fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
          {weekLabel}
        </span>
        <button
          onClick={() => setWeekOffset(v => Math.min(0, v + 1))}
          disabled={weekOffset === 0}
          style={{
            width: 24, height: 24, background: "none", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", cursor: weekOffset === 0 ? "default" : "pointer",
            color: weekOffset === 0 ? "var(--border)" : "var(--text-muted)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
          }}
        >
          ›
        </button>
        <button
          onClick={exportReport}
          title="Copy report"
          style={{
            padding: "3px 8px", background: "none", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-muted)",
            fontSize: 10, fontFamily: "var(--font-sans)",
          }}
        >
          Export
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 16, padding: "0 12px 16px" }}>
        {/* Summary pill */}
        <div style={{
          display: "flex", gap: 8, flexWrap: "wrap",
        }}>
          {[
            { label: "Total", value: fmtHmLong(totalWeekSecs) },
            { label: "Sessions", value: String(weekSessions.length) },
            { label: "Goals hit", value: `${goalDaysHit}/7d` },
          ].map(({ label, value }) => (
            <div key={label} style={{
              flex: 1, minWidth: 60, padding: "6px 4px", background: "var(--bg-elevated)",
              borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", textAlign: "center",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Time by project */}
        <div>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Time by Project
          </span>
          {projectTotals.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginTop: 6 }}>No tracked time this week</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {projectTotals.map(({ id, secs, project }) => {
                const pct = secs / maxProjectSecs;
                const barW = Math.max(3, pct * 180);
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: project!.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "var(--text-muted)", width: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {project!.name}
                    </span>
                    <svg width={190} height={chartBarH} style={{ flex: 1, minWidth: 0 }}>
                      <rect x={0} y={chartBarH / 2 - 5} width={190} height={10} rx={3} fill="var(--bg-elevated)" />
                      <rect x={0} y={chartBarH / 2 - 5} width={barW} height={10} rx={3} fill={project!.color} opacity={0.85} />
                    </svg>
                    <span style={{ fontSize: 10, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", flexShrink: 0, width: 40, textAlign: "right" }}>
                      {fmtHmLong(secs)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Daily breakdown */}
        <div>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Daily Breakdown
          </span>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
            <svg width={dayChartW} height={72} style={{ overflow: "visible" }}>
              {dailyData.map(({ day, byProject, total }, i) => {
                const x = i * (dayBarW + dayGap);
                const fullH = 52;
                let yOffset = fullH;
                const label = day.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
                const isToday = toDateStr(day.getTime()) === todayStr();

                const segments: { projectId: string; secs: number }[] = Object.entries(byProject)
                  .map(([projectId, secs]) => ({ projectId, secs }))
                  .sort((a, b) => b.secs - a.secs);

                return (
                  <g key={i}>
                    {total === 0 ? (
                      <rect x={x} y={fullH - 2} width={dayBarW} height={2} rx={1} fill="var(--border)" />
                    ) : (
                      segments.map(({ projectId, secs }) => {
                        const project = projects.find(p => p.id === projectId);
                        const segH = Math.max(2, (secs / maxDaySecs) * fullH);
                        yOffset -= segH;
                        return (
                          <rect
                            key={projectId}
                            x={x} y={yOffset} width={dayBarW} height={segH}
                            fill={project?.color ?? "var(--text-muted)"}
                            opacity={0.85}
                          />
                        );
                      })
                    )}
                    <text
                      x={x + dayBarW / 2} y={fullH + 13}
                      textAnchor="middle" fontSize={9}
                      fill={isToday ? "var(--accent)" : "var(--text-muted)"}
                      fontFamily="var(--font-sans)"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          {/* Legend */}
          {projectTotals.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {projectTotals.map(({ id, project }) => (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, color: "var(--text-muted)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: project!.color }} />
                  {project!.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Focus quality */}
        {qualityStats && (
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Focus Quality
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {[
                { label: "Avg session", value: fmtHmLong(qualityStats.avg) },
                { label: "Longest", value: fmtHmLong(qualityStats.longest) },
                { label: "Pomodoros", value: String(qualityStats.totalPomodoros) },
                ...(qualityStats.interruptions > 0 ? [{ label: "Interruptions", value: String(qualityStats.interruptions) }] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{
                  flex: 1, minWidth: 60, padding: "6px 4px", background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", textAlign: "center",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Goals progress */}
        <div>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Goals Progress
          </span>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Days goal hit</span>
              <span style={{ fontSize: 11, color: goalDaysHit >= 5 ? "var(--accent)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {goalDaysHit} / 7
              </span>
            </div>
            <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${(goalDaysHit / 7) * 100}%`,
                background: goalDaysHit >= 5 ? "var(--accent)" : "var(--text-muted)",
                borderRadius: 2, transition: "width 0.3s",
              }} />
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {days.map((day, i) => {
                const dayStart = new Date(day);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(day);
                dayEnd.setHours(23, 59, 59, 999);
                const daySess = sessionLog.filter(s => {
                  const d = new Date(s.completedAt);
                  return d >= dayStart && d <= dayEnd && s.mode === "focus" && !s.interrupted;
                });
                const dayMin = daySess.reduce((acc, s) => acc + s.durationMin, 0);
                const hit = daySess.length >= dailyGoals.focusSessions && dayMin >= dailyGoals.focusMinutes;
                const label = day.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1);
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: hit ? "var(--accent)" : "var(--border)",
                    }} />
                    <span style={{ fontSize: 8, color: "var(--text-muted)" }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function FocusTimer() {
  // Settings
  const [focusDur, setFocusDur] = useState(() => lsGet("hm-timer-focus-duration", 25));
  const [shortBreakDur, setShortBreakDur] = useState(() => lsGet("hm-timer-short-break", 5));
  const [longBreakDur, setLongBreakDur] = useState(() => lsGet("hm-timer-long-break", 15));
  const [customDur, setCustomDur] = useState(() => lsGet("hm-timer-custom-duration", 30));
  const [autoAdvance, setAutoAdvance] = useState(() => lsGet("hm-timer-auto-advance", false));
  const [soundEnabled, setSoundEnabled] = useState(() => lsGet("hm-timer-sound", true));
  const [notifEnabled, setNotifEnabled] = useState(() => lsGet("hm-timer-notification", true));

  // Daily goals
  const [dailyGoals, setDailyGoals] = useState<DailyGoals>(() =>
    lsGet("hm-timer-daily-goals", { focusSessions: 4, focusMinutes: 100 })
  );

  // Streak (calendar-day based)
  const [streakData, setStreakData] = useState<StreakData>(() =>
    lsGet("hm-timer-streak", { current: 0, longest: 0, lastDate: "" })
  );

  // Daily activity dates (for streak calendar)
  const [activityDates, setActivityDates] = useState<string[]>(() =>
    lsGet("hm-timer-daily-dates", [])
  );

  // Ambient sound
  const [ambientSound, setAmbientSound] = useState<AmbientSound>(() =>
    lsGet("hm-timer-ambient", "none") as AmbientSound
  );
  const [ambientVolume, setAmbientVolume] = useState(() =>
    lsGet("hm-timer-ambient-volume", 0.3)
  );
  const ambientRef = useRef<AmbientNodes | null>(null);

  // Timer state
  const [mode, setMode] = useState<TimerMode>("focus");
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => lsGet("hm-timer-focus-duration", 25) * 60);
  const [pomodoroCount, setPomodoroCount] = useState(() => lsGet("hm-timer-pomodoro-count", 0));

  // Session log
  const [sessionLog, setSessionLog] = useState<TimerSession[]>(() => lsGet("hm-timer-sessions", []));

  // Projects + time entries
  const [projects, setProjects] = useState<Project[]>(() => lsGet("hm-projects", []));
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>(() => lsGet("hm-time-entries", []));

  // UI state
  const [mainTab, setMainTab] = useState<MainTab>("timer");
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [linkedSessionId, setLinkedSessionId] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<Session[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  // Duration for current mode
  const modeDuration = useCallback((m: TimerMode): number => {
    if (m === "focus") return focusDur;
    if (m === "short_break") return shortBreakDur;
    if (m === "long_break") return longBreakDur;
    return customDur;
  }, [focusDur, shortBreakDur, longBreakDur, customDur]);

  const totalSeconds = modeDuration(mode) * 60;
  const progress = secondsLeft / totalSeconds;

  // Persist settings
  useEffect(() => { lsSet("hm-timer-focus-duration", focusDur); }, [focusDur]);
  useEffect(() => { lsSet("hm-timer-short-break", shortBreakDur); }, [shortBreakDur]);
  useEffect(() => { lsSet("hm-timer-long-break", longBreakDur); }, [longBreakDur]);
  useEffect(() => { lsSet("hm-timer-auto-advance", autoAdvance); }, [autoAdvance]);
  useEffect(() => { lsSet("hm-timer-sound", soundEnabled); }, [soundEnabled]);
  useEffect(() => { lsSet("hm-timer-notification", notifEnabled); }, [notifEnabled]);
  useEffect(() => { lsSet("hm-timer-pomodoro-count", pomodoroCount); }, [pomodoroCount]);
  useEffect(() => { lsSet("hm-timer-sessions", sessionLog); }, [sessionLog]);
  useEffect(() => { lsSet("hm-timer-daily-goals", dailyGoals); }, [dailyGoals]);
  useEffect(() => { lsSet("hm-timer-streak", streakData); }, [streakData]);
  useEffect(() => { lsSet("hm-timer-daily-dates", activityDates); }, [activityDates]);
  useEffect(() => { lsSet("hm-timer-ambient", ambientSound); }, [ambientSound]);
  useEffect(() => { lsSet("hm-timer-ambient-volume", ambientVolume); }, [ambientVolume]);
  useEffect(() => { lsSet("hm-time-entries", timeEntries); }, [timeEntries]);

  // Ambient sound: start/stop with running state
  useEffect(() => {
    if (running && ambientSound !== "none") {
      if (!ambientRef.current) {
        ambientRef.current = createAmbient(ambientSound, ambientVolume);
      }
    } else {
      if (ambientRef.current) {
        stopAmbient(ambientRef.current);
        ambientRef.current = null;
      }
    }
    return () => {
      // cleanup if unmounted while running
    };
  }, [running, ambientSound, ambientVolume]);

  // Update ambient volume live without restarting
  useEffect(() => {
    if (ambientRef.current) {
      try {
        ambientRef.current.gainNode.gain.setValueAtTime(ambientVolume, ambientRef.current.ctx.currentTime);
      } catch { /* ignore */ }
    }
  }, [ambientVolume]);

  // Cleanup ambient on unmount
  useEffect(() => {
    return () => {
      if (ambientRef.current) {
        stopAmbient(ambientRef.current);
        ambientRef.current = null;
      }
    };
  }, []);

  // Load chat sessions for linking
  useEffect(() => {
    if (!sessionsLoaded) {
      fetchApi<Session[]>("/api/sessions").then(data => {
        setChatSessions(data.slice(0, 20));
        setSessionsLoaded(true);
      }).catch(() => {});
    }
  }, [sessionsLoaded]);

  const postToSession = useCallback(async (content: string) => {
    if (!linkedSessionId) return;
    try {
      await fetchApi(`/api/sessions/${linkedSessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, role: "system" }),
      });
    } catch { /* non-critical */ }
  }, [linkedSessionId]);

  // Update streak on focus session completion
  const updateStreak = useCallback(() => {
    const today = todayStr();
    setStreakData(prev => {
      let next: StreakData;
      if (prev.lastDate === today) {
        next = prev;
      } else if (prev.lastDate === yesterdayStr()) {
        next = {
          current: prev.current + 1,
          longest: Math.max(prev.longest, prev.current + 1),
          lastDate: today,
        };
      } else {
        next = { current: 1, longest: Math.max(prev.longest, 1), lastDate: today };
      }
      lsSet("hm-timer-streak", next);
      return next;
    });
    setActivityDates(prev => {
      if (prev.includes(today)) return prev;
      const next = [...prev, today];
      lsSet("hm-timer-daily-dates", next);
      return next;
    });
  }, []);

  const handleComplete = useCallback((interrupted: boolean) => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;

    const entry: TimerSession = {
      id: Math.random().toString(36).slice(2),
      mode,
      durationMin: modeDuration(mode),
      completedAt: Date.now(),
      interrupted,
    };

    setSessionLog(prev => {
      const next = [entry, ...prev].slice(0, 100);

      if (!interrupted && mode === "focus") {
        const todayStart = startOfDay(Date.now());
        const todayFocusSessions = next.filter(
          s => s.completedAt >= todayStart && s.mode === "focus" && !s.interrupted
        );
        const todayFocusMin = todayFocusSessions.reduce((acc, s) => acc + s.durationMin, 0);
        const goals = lsGet<DailyGoals>("hm-timer-daily-goals", { focusSessions: 4, focusMinutes: 100 });

        const prevSessions = todayFocusSessions.length - 1;
        const prevMin = todayFocusMin - entry.durationMin;
        const wasAlreadyComplete = prevSessions >= goals.focusSessions && prevMin >= goals.focusMinutes;
        const nowComplete = todayFocusSessions.length >= goals.focusSessions && todayFocusMin >= goals.focusMinutes;

        if (nowComplete && !wasAlreadyComplete) {
          playGoalMelody();
          sendNotif("Daily goals complete! 🎯", "You've hit your session and time targets for today.");
          toast.success("Daily goals complete! 🎯");
        }
      }

      return next;
    });

    if (!interrupted && mode === "focus") {
      // Log time entry if project selected
      const projId = selectedProjectId;
      if (projId) {
        const currentPomos = lsGet<number>("hm-timer-pomodoro-count", 0);
        const te: TimeEntry = {
          id: Math.random().toString(36).slice(2),
          projectId: projId,
          date: new Date().toISOString(),
          duration: modeDuration(mode) * 60,
          label: entry.label,
          pomodoroCount: currentPomos + 1,
        };
        setTimeEntries(prev => {
          const next = [te, ...prev];
          lsSet("hm-time-entries", next);
          return next;
        });
      }
    }

    if (!interrupted) {
      if (soundEnabled) playDing();
      if (notifEnabled) {
        const title = mode === "focus" ? "Focus session complete!" : "Break over!";
        const body = `${modeDuration(mode)} min ${MODE_LABELS[mode].toLowerCase()} finished.`;
        sendNotif(title, body);
        toast.success(title);
      }

      if (mode === "focus") {
        const newCount = pomodoroCount + 1;
        setPomodoroCount(newCount);
        lsSet("hm-timer-pomodoro-count", newCount);
        void postToSession(`Focus session complete (${modeDuration(mode)} min logged).`);

        updateStreak();

        if (autoAdvance) {
          const nextMode: TimerMode = newCount % 4 === 0 ? "long_break" : "short_break";
          setMode(nextMode);
          setSecondsLeft(modeDuration(nextMode) * 60);
          setTimeout(() => setRunning(true), 500);
        } else {
          const nextMode: TimerMode = pomodoroCount % 4 === 3 ? "long_break" : "short_break";
          setMode(nextMode);
          setSecondsLeft(modeDuration(nextMode) * 60);
        }
      } else {
        void postToSession(`Break over. Ready for next focus session.`);
        if (autoAdvance) {
          setMode("focus");
          setSecondsLeft(focusDur * 60);
          setTimeout(() => setRunning(true), 500);
        } else {
          setMode("focus");
          setSecondsLeft(focusDur * 60);
        }
      }
    }
  }, [mode, modeDuration, soundEnabled, notifEnabled, pomodoroCount, autoAdvance, focusDur, postToSession, updateStreak, selectedProjectId]);

  // Timer tick
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          handleComplete(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [running, handleComplete]);

  const switchMode = (m: TimerMode) => {
    if (running) handleComplete(true);
    setMode(m);
    setSecondsLeft(modeDuration(m) * 60);
    setRunning(false);
  };

  const handleStart = async () => {
    if (!startedRef.current && notifEnabled) {
      startedRef.current = true;
      await requestNotifPermission();
    }
    if (!running) {
      void postToSession(`${MODE_LABELS[mode]} session started (${modeDuration(mode)} min).`);
    }
    setRunning(true);
  };

  const handlePause = () => setRunning(false);

  const handleReset = () => {
    if (running) handleComplete(true);
    setRunning(false);
    setSecondsLeft(modeDuration(mode) * 60);
  };

  const updateLabel = (id: string, label: string) => {
    setSessionLog(prev => prev.map(s => s.id === id ? { ...s, label } : s));
  };

  // Today's stats
  const todayStart = startOfDay(Date.now());
  const todaySessions = sessionLog.filter(s => s.completedAt >= todayStart && !s.interrupted);
  const todayFocus = todaySessions.filter(s => s.mode === "focus");
  const todayFocusMin = todayFocus.reduce((acc, s) => acc + s.durationMin, 0);

  const sessionGoalMet = todayFocus.length >= dailyGoals.focusSessions;
  const minuteGoalMet = todayFocusMin >= dailyGoals.focusMinutes;

  const mergedActivityDates = useMemo(() => {
    const sessionActivity = lsGet<Record<string, number>>("hm-session-activity", {});
    const fromActivity = Object.keys(sessionActivity);
    const combined = new Set([...activityDates, ...fromActivity]);
    return Array.from(combined);
  }, [activityDates]);

  // Project lookup map
  const projectMap = useMemo(() => {
    const m: Record<string, Project> = {};
    for (const p of projects) m[p.id] = p;
    return m;
  }, [projects]);

  // Session -> project: look up via time entries by label/timing proximity
  // For display: just show selected project on new sessions; for log we match by entry id
  const sessionProjectMap = useMemo(() => {
    const map: Record<string, Project> = {};
    for (const e of timeEntries) {
      // time entries don't store sessionId directly; we match by date proximity
      // best effort: find session with same duration and within 5s of entry
      const eDate = new Date(e.date).getTime();
      const match = sessionLog.find(s =>
        s.mode === "focus" &&
        s.durationMin * 60 === e.duration &&
        Math.abs(s.completedAt - eDate) < 10000
      );
      if (match && projectMap[e.projectId]) {
        map[match.id] = projectMap[e.projectId];
      }
    }
    return map;
  }, [timeEntries, sessionLog, projectMap]);

  const recentLog = sessionLog.slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Main tab bar */}
      <div style={{ display: "flex", gap: 2, padding: "10px 12px 0", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
        {(["timer", "report"] as MainTab[]).map(t => (
          <button
            key={t}
            onClick={() => setMainTab(t)}
            style={{
              flex: 1, padding: "5px 2px", fontSize: 11, border: "none",
              borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
              cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: mainTab === t ? 600 : 400,
              background: mainTab === t ? "var(--bg-elevated)" : "none",
              color: mainTab === t ? "var(--text)" : "var(--text-muted)",
              borderBottom: mainTab === t ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {t === "timer" ? "Timer" : "Report"}
          </button>
        ))}
      </div>

      {mainTab === "report" ? (
        <WeeklyReport
          projects={projects}
          timeEntries={timeEntries}
          sessionLog={sessionLog}
          dailyGoals={dailyGoals}
        />
      ) : (
        <>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 2, padding: "10px 12px 0", flexShrink: 0 }}>
            {(["focus", "short_break", "long_break", "custom"] as TimerMode[]).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  flex: 1, padding: "4px 2px", fontSize: 10, border: "none", borderRadius: "var(--radius-sm)",
                  cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: mode === m ? 600 : 400,
                  background: mode === m ? "var(--bg-elevated)" : "none",
                  color: mode === m ? "var(--text)" : "var(--text-muted)",
                  borderBottom: mode === m ? `2px solid ${MODE_COLORS[m]}` : "2px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {m === "short_break" ? "Short" : m === "long_break" ? "Long" : MODE_LABELS[m]}
              </button>
            ))}
          </div>

          {/* Timer ring */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "20px 0 16px", flexShrink: 0, gap: 0,
          }}>
            <div style={{ position: "relative", width: 160, height: 160 }}>
              <ProgressRing progress={progress} mode={mode} running={running} />
              <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 2,
              }}>
                <span style={{
                  fontSize: 32, fontVariantNumeric: "tabular-nums", fontWeight: 600,
                  color: "var(--text)", fontFamily: "var(--font-mono)",
                  letterSpacing: "-0.02em",
                }}>
                  {fmtMmSs(secondsLeft)}
                </span>
                <span style={{ fontSize: 10, color: MODE_COLORS[mode], fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {MODE_LABELS[mode]}
                </span>
                {mode === "focus" && pomodoroCount > 0 && (
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {"●".repeat(Math.min(pomodoroCount % 4 || 4, 4))}
                  </span>
                )}
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
              <button
                onClick={handleReset}
                title="Reset"
                style={{
                  width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border)",
                  background: "var(--bg-elevated)", cursor: "pointer", color: "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                }}
              >
                ↺
              </button>
              <button
                onClick={running ? handlePause : handleStart}
                style={{
                  width: 44, height: 44, borderRadius: "50%", border: "none",
                  background: running ? "var(--bg-elevated)" : MODE_COLORS[mode],
                  cursor: "pointer", color: running ? "var(--text)" : "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, boxShadow: running ? "none" : "0 2px 8px rgba(0,0,0,0.2)",
                  transition: "all 0.15s",
                }}
              >
                {running ? "⏸" : "▶"}
              </button>
              <button
                onClick={() => setShowSettings(v => !v)}
                title="Settings"
                style={{
                  width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border)",
                  background: showSettings ? "var(--bg-elevated)" : "none",
                  cursor: "pointer", color: "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                }}
              >
                ⚙
              </button>
            </div>
          </div>

          {/* Custom duration input */}
          {mode === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px", flexShrink: 0 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Duration</label>
              <input
                type="number" min={1} max={180} value={customDur}
                onChange={e => {
                  const v = Math.max(1, Math.min(180, parseInt(e.target.value) || 1));
                  setCustomDur(v);
                  lsSet("hm-timer-custom-duration", v);
                  if (!running) setSecondsLeft(v * 60);
                }}
                style={{
                  width: 60, padding: "3px 6px", fontSize: 12, background: "var(--bg-elevated)",
                  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)",
                  outline: "none", fontFamily: "var(--font-sans)",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>min</span>
            </div>
          )}

          {/* Project selector */}
          <ProjectSelector
            projects={projects}
            selectedId={selectedProjectId}
            onSelect={setSelectedProjectId}
            onProjectsChange={setProjects}
            timeEntries={timeEntries}
          />

          {/* Link to session */}
          <div style={{ padding: "0 12px 10px", flexShrink: 0 }}>
            <select
              value={linkedSessionId ?? ""}
              onChange={e => setLinkedSessionId(e.target.value || null)}
              style={{
                width: "100%", padding: "4px 8px", fontSize: 11,
                background: "var(--bg-elevated)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", color: linkedSessionId ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer", fontFamily: "var(--font-sans)", outline: "none",
              }}
            >
              <option value="">Link to session (optional)</option>
              {chatSessions.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div style={{
              margin: "0 12px 10px", padding: 12, background: "var(--bg-elevated)",
              borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
              flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Settings</span>

              {([
                { label: "Focus", val: focusDur, set: setFocusDur, max: 90 },
                { label: "Short break", val: shortBreakDur, set: setShortBreakDur, max: 30 },
                { label: "Long break", val: longBreakDur, set: setLongBreakDur, max: 60 },
              ] as const).map(({ label, val, set, max }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", width: 70, flexShrink: 0 }}>{label}</label>
                  <input
                    type="range" min={1} max={max} value={val}
                    onChange={e => {
                      (set as (v: number) => void)(parseInt(e.target.value));
                      if (!running && mode === (label === "Focus" ? "focus" : label === "Short break" ? "short_break" : "long_break")) {
                        setSecondsLeft(parseInt(e.target.value) * 60);
                      }
                    }}
                    style={{ flex: 1, cursor: "pointer", accentColor: "var(--accent)" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--text)", width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{val}m</span>
                </div>
              ))}

              {([
                { label: "Auto-advance", val: autoAdvance, set: setAutoAdvance },
                { label: "Sound alerts", val: soundEnabled, set: setSoundEnabled },
                { label: "Notifications", val: notifEnabled, set: setNotifEnabled },
              ] as const).map(({ label, val, set }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", flex: 1 }}>{label}</label>
                  <button
                    onClick={async () => {
                      if (!val && label === "Notifications") await requestNotifPermission();
                      (set as (v: boolean) => void)(!val);
                    }}
                    style={{
                      width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                      background: val ? "var(--accent)" : "var(--border)",
                      position: "relative", transition: "background 0.2s", flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: "absolute", top: 2, left: val ? 18 : 2, width: 16, height: 16,
                      borderRadius: "50%", background: "white", transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              ))}

              {/* Daily goals */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>Daily Goals</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", flex: 1 }}>Sessions goal</label>
                  <input
                    type="number" min={1} max={20} value={dailyGoals.focusSessions}
                    onChange={e => setDailyGoals(prev => ({ ...prev, focusSessions: Math.max(1, parseInt(e.target.value) || 1) }))}
                    style={{
                      width: 48, padding: "2px 6px", fontSize: 11, background: "var(--bg)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)",
                      outline: "none", fontFamily: "var(--font-sans)", textAlign: "right",
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", flex: 1 }}>Minutes goal</label>
                  <input
                    type="number" min={1} max={600} value={dailyGoals.focusMinutes}
                    onChange={e => setDailyGoals(prev => ({ ...prev, focusMinutes: Math.max(1, parseInt(e.target.value) || 1) }))}
                    style={{
                      width: 48, padding: "2px 6px", fontSize: 11, background: "var(--bg)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)",
                      outline: "none", fontFamily: "var(--font-sans)", textAlign: "right",
                    }}
                  />
                </div>
              </div>

              {/* Ambient sound */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>Ambient Sound</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {([
                    { value: "none", label: "None" },
                    { value: "whitenoise", label: "White Noise" },
                    { value: "hum", label: "Hum" },
                    { value: "rain", label: "Rain" },
                  ] as const).map(({ value, label }) => (
                    <label key={value} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="ambient-sound"
                        value={value}
                        checked={ambientSound === value}
                        onChange={() => {
                          if (ambientRef.current) {
                            stopAmbient(ambientRef.current);
                            ambientRef.current = null;
                          }
                          setAmbientSound(value);
                          if (running && value !== "none") {
                            ambientRef.current = createAmbient(value, ambientVolume);
                          }
                        }}
                        style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {ambientSound !== "none" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", width: 70, flexShrink: 0 }}>Volume</label>
                    <input
                      type="range" min={0} max={1} step={0.05} value={ambientVolume}
                      onChange={e => setAmbientVolume(parseFloat(e.target.value))}
                      style={{ flex: 1, cursor: "pointer", accentColor: "var(--accent)" }}
                    />
                    <span style={{ fontSize: 11, color: "var(--text)", width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(ambientVolume * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Scrollable bottom section */}
          <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
            {/* Stats */}
            <div style={{ padding: "0 12px 6px", flexShrink: 0 }}>
              <button
                onClick={() => setShowStats(v => !v)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "6px 0",
                  background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)",
                  fontSize: 11, fontFamily: "var(--font-sans)", fontWeight: 500,
                }}
              >
                <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{showStats ? "▾" : "▸"}</span>
                Stats
              </button>

              {showStats && (
                <div style={{ paddingBottom: 10 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {[
                      { label: "Focus today", value: `${todayFocusMin}m` },
                      { label: "Sessions", value: String(todayFocus.length) },
                      { label: "Streak", value: `${streakData.current}d` },
                    ].map(({ label, value }) => (
                      <div key={label} style={{
                        flex: 1, padding: "8px 6px", background: "var(--bg-elevated)",
                        borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
                        textAlign: "center",
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Best: {streakData.longest} days</span>
                    <StreakStrip activeDates={mergedActivityDates} />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                    <GoalBar
                      label="Sessions today"
                      current={todayFocus.length}
                      goal={dailyGoals.focusSessions}
                      unit=""
                    />
                    <GoalBar
                      label="Focus time today"
                      current={todayFocusMin}
                      goal={dailyGoals.focusMinutes}
                      unit="m"
                    />
                    {sessionGoalMet && minuteGoalMet && (
                      <div style={{ fontSize: 10, color: "var(--accent)", textAlign: "center", fontWeight: 500 }}>
                        Goal reached!
                      </div>
                    )}
                  </div>

                  <WeekChart sessions={sessionLog} />
                </div>
              )}
            </div>

            {/* Session log */}
            <div style={{ padding: "0 12px 12px", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", flex: 1 }}>
                  Recent sessions
                </span>
                {sessionLog.length > 0 && (
                  <button
                    onClick={() => { setSessionLog([]); lsSet("hm-timer-sessions", []); }}
                    style={{ fontSize: 10, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {recentLog.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", padding: "6px 8px" }}>
                  No sessions yet
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {recentLog.map(s => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      project={sessionProjectMap[s.id]}
                      onLabelChange={updateLabel}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
