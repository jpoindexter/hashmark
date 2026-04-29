import { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Issue {
  id: string;
  title: string;
  status: string;
  priority: "high" | "medium" | "low" | string;
  due_date: string | null;
  description?: string;
}

interface Routine {
  id: string;
  name: string;
  schedule: string;
  last_run?: string | null;
  enabled?: boolean;
}

interface DayEvent {
  type: "issue" | "routine";
  id: string;
  title: string;
  priority?: string;
  status?: string;
  due_date?: string;
  description?: string;
  schedule?: string;
  last_run?: string | null;
}

type ViewMode = "month" | "week" | "agenda";

// ── Cron helpers ───────────────────────────────────────────────────────────────

function parseCronField(field: string, min: number, max: number): number[] {
  if (field === "*") {
    const r: number[] = [];
    for (let i = min; i <= max; i++) r.push(i);
    return r;
  }
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step)) return [];
    const r: number[] = [];
    for (let i = min; i <= max; i += step) r.push(i);
    return r;
  }
  if (field.includes(",")) {
    return field.split(",").map(v => parseInt(v, 10)).filter(v => !isNaN(v) && v >= min && v <= max);
  }
  const n = parseInt(field, 10);
  if (!isNaN(n) && n >= min && n <= max) return [n];
  return [];
}

// Returns dates within [start, end] when a cron schedule fires
function cronOccurrences(cron: string, start: Date, end: Date): Date[] {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return [];
  const [mf, hf, domf, monf, dowf] = parts;
  const minutes = parseCronField(mf, 0, 59);
  const hours = parseCronField(hf, 0, 23);
  const doms = parseCronField(domf, 1, 31);
  const months = parseCronField(monf, 1, 12);
  const dows = parseCronField(dowf, 0, 6);

  const results: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const month = cursor.getMonth() + 1;
    const dom = cursor.getDate();
    const dow = cursor.getDay();

    if (months.includes(month) && doms.includes(dom) && dows.includes(dow)) {
      for (const h of hours) {
        for (const m of minutes) {
          const d = new Date(cursor);
          d.setHours(h, m, 0, 0);
          if (d >= start && d <= end) results.push(d);
        }
      }
      if (hours.length === 0 || minutes.length === 0) {
        results.push(new Date(cursor));
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

// ── Date utilities ─────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_ABBRS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const HOURS = Array.from({ length: 29 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

// ── Priority colors ────────────────────────────────────────────────────────────

function priorityColor(priority: string): string {
  if (priority === "high") return "var(--error)";
  if (priority === "medium") return "var(--warning)";
  return "var(--success)";
}

function priorityBg(priority: string): string {
  if (priority === "high") return "rgba(239,68,68,0.15)";
  if (priority === "medium") return "rgba(234,179,8,0.15)";
  return "rgba(34,197,94,0.15)";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EventChip({
  event,
  onClick,
  onDragStart,
}: {
  event: DayEvent;
  onClick: (e: React.MouseEvent, event: DayEvent) => void;
  onDragStart?: (e: React.DragEvent, issueId: string) => void;
}) {
  if (event.type === "issue") {
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart?.(e, event.id)}
        onClick={(e) => { e.stopPropagation(); onClick(e, event); }}
        style={{
          fontSize: 10,
          padding: "1px 5px",
          borderRadius: 3,
          background: priorityBg(event.priority ?? "low"),
          color: priorityColor(event.priority ?? "low"),
          cursor: "grab",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          lineHeight: 1.5,
          border: `1px solid ${priorityColor(event.priority ?? "low")}44`,
        }}
        title={event.title}
        data-chip="1"
      >
        {event.title}
      </div>
    );
  }
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(e, event); }}
      style={{
        fontSize: 10,
        padding: "1px 5px",
        borderRadius: 3,
        background: "rgba(59,130,246,0.15)",
        color: "var(--accent)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        lineHeight: 1.5,
        border: "1px solid rgba(59,130,246,0.3)",
      }}
      title={event.title}
      data-chip="1"
    >
      ↻ {event.title}
    </div>
  );
}

function EventPopover({
  event,
  anchorRect,
  onClose,
  onRunRoutine,
  onOpenIssue,
}: {
  event: DayEvent;
  anchorRect: DOMRect;
  onClose: () => void;
  onRunRoutine: (id: string) => void;
  onOpenIssue: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 220);
  const left = Math.min(anchorRect.left, window.innerWidth - 240);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        width: 232,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        zIndex: 100,
        padding: 12,
        fontSize: 12,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text)", lineHeight: 1.3 }}>{event.title}</div>

      {event.type === "issue" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ padding: "1px 7px", borderRadius: 10, background: "var(--bg-panel)", color: "var(--text-secondary)", fontSize: 11 }}>
              {event.status}
            </span>
            <span style={{ padding: "1px 7px", borderRadius: 10, background: priorityBg(event.priority ?? "low"), color: priorityColor(event.priority ?? "low"), fontSize: 11 }}>
              {event.priority}
            </span>
          </div>
          {event.due_date && (
            <div style={{ color: "var(--text-secondary)", marginBottom: 4 }}>Due: {event.due_date}</div>
          )}
          {event.description && (
            <div style={{ color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.4, maxHeight: 60, overflow: "hidden" }}>
              {event.description.slice(0, 120)}{event.description.length > 120 ? "…" : ""}
            </div>
          )}
          <button
            onClick={() => { onOpenIssue(event.id); onClose(); }}
            className="btn btn-primary btn-sm"
            style={{ width: "100%", textAlign: "center" }}
          >
            Open in Issues
          </button>
        </>
      )}

      {event.type === "routine" && (
        <>
          {event.schedule && (
            <div style={{ color: "var(--text-secondary)", marginBottom: 4 }}>Schedule: <code style={{ fontSize: 11 }}>{event.schedule}</code></div>
          )}
          {event.last_run && (
            <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>Last run: {new Date(event.last_run).toLocaleString()}</div>
          )}
          <button
            onClick={() => { onRunRoutine(event.id); onClose(); }}
            className="btn btn-primary btn-sm"
            style={{ width: "100%", textAlign: "center" }}
          >
            Run now
          </button>
        </>
      )}
    </div>
  );
}

function OverflowPopover({
  events,
  anchorRect,
  onClose,
  onEventClick,
  onDragStart,
}: {
  events: DayEvent[];
  anchorRect: DOMRect;
  onClose: () => void;
  onEventClick: (e: React.MouseEvent, event: DayEvent) => void;
  onDragStart: (e: React.DragEvent, issueId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 300);
  const left = Math.min(anchorRect.left, window.innerWidth - 200);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        width: 192,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        zIndex: 100,
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 12,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2, padding: "0 4px" }}>All events</div>
      {events.map(ev => (
        <EventChip
          key={`${ev.type}-${ev.id}`}
          event={ev}
          onClick={(e, event) => { onClose(); onEventClick(e, event); }}
          onDragStart={onDragStart}
        />
      ))}
    </div>
  );
}

function QuickCreatePopover({
  date,
  anchorRect,
  onClose,
  onCreated,
}: {
  date: string;
  anchorRect: DOMRect;
  onClose: () => void;
  onCreated: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 200);
  const left = Math.min(anchorRect.left, window.innerWidth - 240);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await fetchApi("/api/issues", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), priority, due_date: date, status: "open" }),
      });
      toast.success("Issue created");
      onCreated();
      onClose();
    } catch {
      toast.error("Failed to create issue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        width: 240,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        zIndex: 100,
        padding: 12,
        fontSize: 12,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>New issue for {date}</div>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); if (e.key === "Escape") onClose(); }}
        placeholder="Issue title..."
        style={{
          width: "100%",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "5px 8px",
          fontSize: 12,
          color: "var(--text)",
          outline: "none",
          marginBottom: 8,
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {(["high", "medium", "low"] as const).map(p => (
          <button
            key={p}
            onClick={() => setPriority(p)}
            style={{
              flex: 1,
              padding: "2px 0",
              fontSize: 11,
              borderRadius: 4,
              border: `1px solid ${priority === p ? priorityColor(p) : "var(--border)"}`,
              background: priority === p ? priorityBg(p) : "none",
              color: priority === p ? priorityColor(p) : "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {p}
          </button>
        ))}
      </div>
      <button
        onClick={() => void handleCreate()}
        disabled={!title.trim() || saving}
        className="btn btn-primary btn-sm"
        style={{ width: "100%", textAlign: "center" }}
      >
        {saving ? "Creating…" : "Create Issue"}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CalendarView() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = isoDate(today);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [showIssues, setShowIssues] = useState(true);
  const [showRoutines, setShowRoutines] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  // Drag state
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const dragIssueId = useRef<string | null>(null);

  // Agenda day refs for scrollIntoView
  const agendaDayRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Popover state
  const [eventPopover, setEventPopover] = useState<{ event: DayEvent; rect: DOMRect } | null>(null);
  const [overflowPopover, setOverflowPopover] = useState<{ events: DayEvent[]; rect: DOMRect } | null>(null);
  const [createPopover, setCreatePopover] = useState<{ date: string; rect: DOMRect } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [issueData] = await Promise.all([
        fetchApi<Issue[]>("/api/issues").catch(() => [] as Issue[]),
      ]);
      setIssues(issueData.filter(i => i.due_date));

      // Try API first, fall back to localStorage
      let routineData: Routine[] = [];
      try {
        routineData = await fetchApi<Routine[]>("/api/routines");
      } catch {
        try {
          const raw = localStorage.getItem("hm-routines");
          if (raw) routineData = JSON.parse(raw) as Routine[];
        } catch { /* ignore */ }
      }
      setRoutines(routineData);
    } catch {
      // silently fail — calendar is non-critical
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // Build event map: dateStr -> DayEvent[]
  const eventMap = useCallback((): Map<string, DayEvent[]> => {
    const map = new Map<string, DayEvent[]>();

    const addEvent = (key: string, ev: DayEvent) => {
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    };

    if (showIssues) {
      for (const issue of issues) {
        if (!issue.due_date) continue;
        if (priorityFilter !== "all" && issue.priority !== priorityFilter) continue;
        addEvent(issue.due_date, {
          type: "issue",
          id: issue.id,
          title: issue.title,
          priority: issue.priority,
          status: issue.status,
          due_date: issue.due_date,
          description: issue.description,
        });
      }
    }

    if (showRoutines) {
      // Determine range to compute occurrences for
      let rangeStart: Date;
      let rangeEnd: Date;

      if (viewMode === "month") {
        rangeStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        rangeEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      } else if (viewMode === "week") {
        rangeStart = new Date(weekStart);
        rangeEnd = addDays(weekStart, 6);
      } else {
        // agenda: next 30 days
        rangeStart = new Date(today);
        rangeEnd = addDays(today, 30);
      }

      for (const routine of routines) {
        if (!routine.schedule) continue;
        const occurrences = cronOccurrences(routine.schedule, rangeStart, rangeEnd);
        for (const occ of occurrences) {
          const key = isoDate(occ);
          addEvent(key, {
            type: "routine",
            id: routine.id,
            title: routine.name,
            schedule: routine.schedule,
            last_run: routine.last_run,
          });
        }
      }
    }

    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, routines, showIssues, showRoutines, priorityFilter, cursor, weekStart, viewMode]);

  const evMap = eventMap();

  // ── Stats ──────────────────────────────────────────────────────────────────

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const monthIssues = issues.filter(i => i.due_date && i.due_date >= isoDate(monthStart) && i.due_date <= isoDate(monthEnd));
  const overdueIssues = issues.filter(i => i.due_date && i.due_date < todayStr && i.status !== "done");
  const doneThisMonth = monthIssues.filter(i => i.status === "done").length;
  const completionRate = monthIssues.length > 0 ? Math.round((doneThisMonth / monthIssues.length) * 100) : 0;

  // Count routines for this month
  const routineOccurrencesThisMonth = routines.reduce((acc, r) => {
    if (!r.schedule) return acc;
    return acc + cronOccurrences(r.schedule, monthStart, monthEnd).length;
  }, 0);

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    dragIssueId.current = issueId;
    e.dataTransfer.setData("text/plain", issueId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the cell entirely (not into a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverDate(null);
    }
  };

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const issueId = e.dataTransfer.getData("text/plain") || dragIssueId.current;
    dragIssueId.current = null;
    if (!issueId) return;

    // Update localStorage hm-issues
    try {
      const raw = localStorage.getItem("hm-issues");
      const stored: Issue[] = raw ? (JSON.parse(raw) as Issue[]) : [];
      const idx = stored.findIndex(i => i.id === issueId);
      if (idx !== -1) {
        stored[idx].due_date = dateStr;
        localStorage.setItem("hm-issues", JSON.stringify(stored));
      }
    } catch { /* ignore */ }

    // Optimistic update in state
    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, due_date: dateStr } : i));

    const label = new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    toast.success(`Rescheduled to ${label}`);
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleEventClick = (e: React.MouseEvent, event: DayEvent) => {
    setCreatePopover(null);
    setOverflowPopover(null);
    setEventPopover({ event, rect: (e.target as HTMLElement).getBoundingClientRect() });
  };

  const handleDayClick = (e: React.MouseEvent, dateStr: string) => {
    if ((e.target as HTMLElement).closest("[data-chip]")) return;
    setEventPopover(null);
    setOverflowPopover(null);
    setCreatePopover({ date: dateStr, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() });
  };

  const handleOverflowClick = (e: React.MouseEvent, events: DayEvent[]) => {
    e.stopPropagation();
    setEventPopover(null);
    setCreatePopover(null);
    setOverflowPopover({ events, rect: (e.target as HTMLElement).getBoundingClientRect() });
  };

  const handleRunRoutine = async (id: string) => {
    try {
      await fetchApi(`/api/routines/${id}/run`, { method: "POST" });
      toast.success("Routine triggered");
    } catch {
      toast.error("Failed to run routine");
    }
  };

  const handleOpenIssue = (id: string) => {
    window.dispatchEvent(new CustomEvent("hm-open-issue", { detail: { issueId: id } }));
  };

  // Navigation
  const prevPeriod = () => {
    if (viewMode === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    } else if (viewMode === "week") {
      setWeekStart(addDays(weekStart, -7));
    }
  };

  const nextPeriod = () => {
    if (viewMode === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    } else if (viewMode === "week") {
      setWeekStart(addDays(weekStart, 7));
    }
  };

  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setWeekStart(startOfWeek(today));
    // Scroll to today in agenda view
    const el = agendaDayRefs.current.get(todayStr);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Month grid build ───────────────────────────────────────────────────────

  const buildMonthGrid = () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: Date; inMonth: boolean }> = [];

    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = offset - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, prevMonthDays - i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    const remainder = 42 - cells.length;
    for (let d = 1; d <= remainder; d++) {
      cells.push({ date: new Date(year, month + 1, d), inMonth: false });
    }

    return cells;
  };

  const monthGrid = viewMode === "month" ? buildMonthGrid() : [];

  // ── Week grid build ────────────────────────────────────────────────────────

  const weekDays = viewMode === "week"
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : [];

  const weekLabel = viewMode === "week"
    ? `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : viewMode === "agenda"
    ? "Agenda"
    : `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;

  // ── Agenda build ───────────────────────────────────────────────────────────

  const buildAgendaDays = () => {
    const days: Array<{ date: Date; dateStr: string; events: DayEvent[] }> = [];
    for (let i = 0; i <= 30; i++) {
      const d = addDays(today, i);
      const ds = isoDate(d);
      const events = evMap.get(ds) ?? [];
      if (events.length > 0) days.push({ date: d, dateStr: ds, events });
    }
    return days;
  };

  const agendaOverdue = overdueIssues
    .filter(i => {
      if (priorityFilter !== "all" && i.priority !== priorityFilter) return false;
      return true;
    })
    .map<DayEvent>(i => ({
      type: "issue",
      id: i.id,
      title: i.title,
      priority: i.priority,
      status: i.status,
      due_date: i.due_date ?? undefined,
      description: i.description,
    }));

  // Drop-target cell style helper
  const dropCellStyle = (dateStr: string): React.CSSProperties =>
    dragOverDate === dateStr
      ? { background: "color-mix(in srgb, var(--accent) 20%, transparent)" }
      : {};

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", fontSize: 12 }}>

      {/* Stats strip */}
      <div style={{
        display: "flex", gap: 12, padding: "8px 14px",
        borderBottom: "1px solid var(--border)", flexShrink: 0,
        background: "var(--bg-panel)", flexWrap: "wrap",
      }}>
        <StatChip label="Due this month" value={monthIssues.length} />
        <StatChip label="Overdue" value={overdueIssues.length} color={overdueIssues.length > 0 ? "var(--error)" : undefined} />
        <StatChip label="Routines" value={routineOccurrencesThisMonth} color="var(--accent)" />
        <StatChip label="Completion" value={`${completionRate}%`} color={completionRate >= 80 ? "var(--success)" : undefined} />
      </div>

      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
        borderBottom: "1px solid var(--border)", flexShrink: 0, flexWrap: "wrap",
      }}>
        {/* Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {viewMode !== "agenda" && <button onClick={prevPeriod} style={navBtnStyle}>‹</button>}
          <button onClick={goToday} style={{ ...navBtnStyle, padding: "2px 8px", fontSize: 11 }}>Today</button>
          {viewMode !== "agenda" && <button onClick={nextPeriod} style={navBtnStyle}>›</button>}
        </div>
        <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{weekLabel}</span>
        <div style={{ flex: 1 }} />

        {/* Filters */}
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={showIssues} onChange={e => setShowIssues(e.target.checked)} style={{ accentColor: "var(--error)" }} />
          Issues
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={showRoutines} onChange={e => setShowRoutines(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
          Routines
        </label>
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value as typeof priorityFilter)}
          style={{
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "2px 6px", fontSize: 11,
            color: "var(--text-secondary)", cursor: "pointer", outline: "none",
          }}
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* View toggle */}
        <div style={{ display: "flex", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          {(["month", "week", "agenda"] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              style={{
                padding: "2px 10px", fontSize: 11, border: "none", cursor: "pointer",
                background: viewMode === v ? "var(--bg-elevated)" : "none",
                color: viewMode === v ? "var(--text)" : "var(--text-muted)",
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {viewMode === "month" ? (
          <div style={{ padding: "0 0 8px" }}>
            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
              {DAY_ABBRS.map(d => (
                <div key={d} style={{ textAlign: "center", padding: "6px 4px", fontSize: 11, color: "var(--text-muted)", fontWeight: 500, borderRight: "1px solid var(--border)" }}>
                  {d}
                </div>
              ))}
            </div>
            {/* Grid cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {monthGrid.map((cell, idx) => {
                const dateStr = isoDate(cell.date);
                const events = evMap.get(dateStr) ?? [];
                const isToday = dateStr === todayStr;
                const isOverdue = events.some(e => e.type === "issue") && dateStr < todayStr && events.some(e => e.type === "issue" && e.status !== "done");
                const visible = events.slice(0, 3);
                const overflow = events.length - 3;
                const isDragOver = dragOverDate === dateStr;

                return (
                  <div
                    key={idx}
                    onClick={(e) => handleDayClick(e, dateStr)}
                    onDragOver={(e) => handleDragOver(e, dateStr)}
                    onDragEnter={(e) => { e.preventDefault(); setDragOverDate(dateStr); }}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateStr)}
                    style={{
                      minHeight: 88,
                      padding: "4px 5px",
                      borderRight: "1px solid var(--border)",
                      borderBottom: "1px solid var(--border)",
                      background: isDragOver
                        ? "color-mix(in srgb, var(--accent) 20%, transparent)"
                        : isToday ? "var(--bg-elevated)" : "none",
                      cursor: "pointer",
                      outline: isOverdue ? "1.5px solid var(--error)" : "none",
                      outlineOffset: -1,
                      position: "relative",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (!isToday && !isDragOver) e.currentTarget.style.background = "var(--bg-panel)"; }}
                    onMouseLeave={e => { if (!isToday && !isDragOver) e.currentTarget.style.background = "none"; }}
                  >
                    <div style={{
                      fontSize: 11, fontWeight: isToday ? 700 : 400,
                      color: !cell.inMonth ? "var(--text-muted)" : isToday ? "var(--accent)" : "var(--text-secondary)",
                      marginBottom: 3,
                      display: "inline-block",
                      width: 20, height: 20, lineHeight: "20px", textAlign: "center",
                      borderRadius: isToday ? "50%" : undefined,
                      background: isToday ? "var(--accent)" : undefined,
                      ...(isToday ? { color: "var(--bg)" } : {}),
                    } as React.CSSProperties}>
                      {cell.date.getDate()}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {visible.map(ev => (
                        <EventChip key={`${ev.type}-${ev.id}`} event={ev} onClick={handleEventClick} onDragStart={handleDragStart} />
                      ))}
                      {overflow > 0 && (
                        <button
                          onClick={(e) => handleOverflowClick(e, events)}
                          style={{ fontSize: 10, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "0 1px" }}
                        >
                          +{overflow} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : viewMode === "week" ? (
          /* Week view */
          <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "48px repeat(7, 1fr)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div />
              {weekDays.map((d, i) => {
                const ds = isoDate(d);
                const isToday = ds === todayStr;
                return (
                  <div key={i} style={{ textAlign: "center", padding: "6px 4px", borderLeft: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{DAY_ABBRS[i]}</div>
                    <div style={{
                      fontSize: 13, fontWeight: isToday ? 700 : 400,
                      color: isToday ? "var(--bg)" : "var(--text-secondary)",
                      display: "inline-block", width: 22, height: 22, lineHeight: "22px",
                      borderRadius: isToday ? "50%" : undefined,
                      background: isToday ? "var(--accent)" : undefined,
                    }}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hour rows */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {HOURS.map((label, rowIdx) => {
                const h = Math.floor(rowIdx / 2) + 8;
                const m = rowIdx % 2 === 0 ? 0 : 30;
                return (
                  <div key={rowIdx} style={{ display: "grid", gridTemplateColumns: "48px repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 6px", textAlign: "right", userSelect: "none" }}>
                      {rowIdx % 2 === 0 ? label : ""}
                    </div>
                    {weekDays.map((d, colIdx) => {
                      const dateStr = isoDate(d);
                      const dayEvents = evMap.get(dateStr) ?? [];
                      const slotEvents = rowIdx === 0
                        ? dayEvents
                        : dayEvents.filter(ev => {
                            if (ev.type === "routine" && ev.schedule) {
                              const parts = ev.schedule.split(/\s+/);
                              if (parts.length >= 2) {
                                const eventHours = parseCronField(parts[1], 0, 23);
                                const eventMins = parseCronField(parts[0], 0, 59);
                                return eventHours.includes(h) && eventMins.includes(m);
                              }
                            }
                            return false;
                          });

                      const issueSlotEvents = rowIdx === 0 ? dayEvents.filter(e => e.type === "issue") : [];
                      const routineSlotEvents = slotEvents.filter(e => e.type === "routine");
                      const combined = [...issueSlotEvents, ...routineSlotEvents];
                      const isDragOver = dragOverDate === dateStr && rowIdx === 0;

                      return (
                        <div
                          key={colIdx}
                          onClick={(e) => { if (combined.length === 0) handleDayClick(e, dateStr); }}
                          onDragOver={rowIdx === 0 ? (e) => handleDragOver(e, dateStr) : undefined}
                          onDragEnter={rowIdx === 0 ? (e) => { e.preventDefault(); setDragOverDate(dateStr); } : undefined}
                          onDragLeave={rowIdx === 0 ? handleDragLeave : undefined}
                          onDrop={rowIdx === 0 ? (e) => handleDrop(e, dateStr) : undefined}
                          style={{
                            minHeight: 28,
                            borderLeft: "1px solid var(--border)",
                            padding: "2px 3px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            cursor: "pointer",
                            background: isDragOver ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "none",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => { if (!isDragOver) e.currentTarget.style.background = "var(--bg-panel)"; }}
                          onMouseLeave={e => { if (!isDragOver) e.currentTarget.style.background = "none"; }}
                        >
                          {combined.slice(0, 2).map(ev => (
                            <EventChip key={`${ev.type}-${ev.id}`} event={ev} onClick={handleEventClick} onDragStart={handleDragStart} />
                          ))}
                          {combined.length > 2 && (
                            <button
                              onClick={(e) => handleOverflowClick(e, combined)}
                              style={{ fontSize: 9, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
                            >
                              +{combined.length - 2}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Agenda view */
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Overdue section */}
            {agendaOverdue.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--error)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 8,
                  paddingBottom: 4,
                  borderBottom: "1px solid var(--error)",
                  opacity: 0.8,
                }}>
                  Overdue
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {agendaOverdue.map(ev => (
                    <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 64 }}>{ev.due_date}</span>
                      <div style={{ flex: 1 }}>
                        <EventChip event={ev} onClick={handleEventClick} onDragStart={handleDragStart} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming days */}
            {buildAgendaDays().map(({ date, dateStr, events }) => {
              const isToday = dateStr === todayStr;
              const dow = date.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

              return (
                <div
                  key={dateStr}
                  ref={(el) => {
                    if (el) agendaDayRefs.current.set(dateStr, el);
                    else agendaDayRefs.current.delete(dateStr);
                  }}
                  style={{ marginBottom: 16 }}
                >
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                    paddingBottom: 4,
                    borderBottom: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                  }}>
                    <span style={{
                      fontWeight: 700,
                      fontSize: 12,
                      color: isToday ? "var(--accent)" : isWeekend ? "var(--text-muted)" : "var(--text)",
                    }}>
                      {label}
                    </span>
                    {isToday && (
                      <span style={{
                        fontSize: 10,
                        padding: "0px 5px",
                        borderRadius: 8,
                        background: "var(--accent)",
                        color: "var(--bg)",
                        fontWeight: 600,
                      }}>
                        Today
                      </span>
                    )}
                  </div>

                  <div
                    onDragOver={(e) => handleDragOver(e, dateStr)}
                    onDragEnter={(e) => { e.preventDefault(); setDragOverDate(dateStr); }}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateStr)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      padding: "4px 6px",
                      borderRadius: "var(--radius-sm)",
                      ...dropCellStyle(dateStr),
                      transition: "background 0.1s",
                    }}
                  >
                    {events.map(ev => (
                      <EventChip
                        key={`${ev.type}-${ev.id}`}
                        event={ev}
                        onClick={handleEventClick}
                        onDragStart={handleDragStart}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {buildAgendaDays().length === 0 && agendaOverdue.length === 0 && (
              <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", marginTop: 40 }}>
                No upcoming issues or routines in the next 30 days.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Popovers */}
      {eventPopover && (
        <EventPopover
          event={eventPopover.event}
          anchorRect={eventPopover.rect}
          onClose={() => setEventPopover(null)}
          onRunRoutine={handleRunRoutine}
          onOpenIssue={handleOpenIssue}
        />
      )}
      {overflowPopover && (
        <OverflowPopover
          events={overflowPopover.events}
          anchorRect={overflowPopover.rect}
          onClose={() => setOverflowPopover(null)}
          onEventClick={handleEventClick}
          onDragStart={handleDragStart}
        />
      )}
      {createPopover && (
        <QuickCreatePopover
          date={createPopover.date}
          anchorRect={createPopover.rect}
          onClose={() => setCreatePopover(null)}
          onCreated={() => void loadData()}
        />
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: color ?? "var(--text)", lineHeight: 1 }}>{value}</span>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  padding: "2px 7px",
  fontSize: 14,
  cursor: "pointer",
  color: "var(--text-secondary)",
  lineHeight: 1.4,
};
