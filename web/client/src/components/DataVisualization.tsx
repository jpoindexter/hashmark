import { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";

// ── Types ────────────────────────────────────────────────────────────────────

type ChartType = "bar" | "hbar" | "line" | "area" | "pie";
type ColorScheme = "accent" | "warm" | "cool" | "mono" | "contrast";
type DataSourceKey =
  | "sessions_by_day"
  | "messages_by_day"
  | "issues_by_status"
  | "issues_by_priority"
  | "time_by_project"
  | "focus_by_day"
  | "agent_usage"
  | "workflow_runs";

interface DataPoint { label: string; value: number }

interface SavedChart {
  id: string;
  title: string;
  source: DataSourceKey;
  chartType: ChartType;
  colorScheme: ColorScheme;
  showLegend: boolean;
  showGrid: boolean;
  showLabels: boolean;
}

interface ChartOpts {
  colors: string[];
  showGrid: boolean;
  showLabels: boolean;
  showLegend: boolean;
  animate: boolean;
}

// ── Color palettes (CSS resolved at render) ──────────────────────────────────

const PALETTES: Record<ColorScheme, string[]> = {
  accent:   ["var(--accent)", "color-mix(in srgb,var(--accent) 70%,#fff)", "color-mix(in srgb,var(--accent) 50%,#fff)", "color-mix(in srgb,var(--accent) 30%,#fff)", "color-mix(in srgb,var(--accent) 15%,#fff)"],
  warm:     ["#f97316", "#f59e0b", "#ef4444", "#fb923c", "#fbbf24"],
  cool:     ["#3b82f6", "#06b6d4", "#8b5cf6", "#6366f1", "#0ea5e9"],
  mono:     ["#94a3b8", "#64748b", "#475569", "#334155", "#1e293b"],
  contrast: ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6", "#a855f7"],
};

const PALETTE_LABELS: Record<ColorScheme, string> = {
  accent: "Accent", warm: "Warm", cool: "Cool", mono: "Mono", contrast: "High contrast",
};

// ── Data sources ─────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<DataSourceKey, string> = {
  sessions_by_day:  "Sessions per day",
  messages_by_day:  "Messages per day",
  issues_by_status: "Issues by status",
  issues_by_priority: "Issues by priority",
  time_by_project:  "Time tracked per project",
  focus_by_day:     "Focus sessions per day",
  agent_usage:      "Agent usage",
  workflow_runs:    "Workflow runs per day",
};

interface StatsResponse {
  trends?: {
    sessions_by_day?: Array<{ date: string; count: number }>;
    messages_by_day?: Array<{ date: string; count: number }>;
  };
  tools?: Array<{ agent?: string; name?: string; count?: number }>;
  agents?: Array<{ name: string; sessions?: number }>;
}

async function loadData(source: DataSourceKey): Promise<DataPoint[]> {
  if (source === "sessions_by_day" || source === "messages_by_day" || source === "agent_usage") {
    try {
      const stats = await fetchApi<StatsResponse>("/api/stats");
      if (source === "sessions_by_day") {
        return (stats.trends?.sessions_by_day ?? []).map(d => ({ label: d.date.slice(5), value: d.count }));
      }
      if (source === "messages_by_day") {
        return (stats.trends?.messages_by_day ?? []).map(d => ({ label: d.date.slice(5), value: d.count }));
      }
      if (source === "agent_usage") {
        const counts: Record<string, number> = {};
        for (const t of (stats.tools ?? [])) {
          const key = t.agent ?? t.name ?? "unknown";
          counts[key] = (counts[key] ?? 0) + (t.count ?? 1);
        }
        for (const a of (stats.agents ?? [])) {
          const key = a.name;
          counts[key] = (counts[key] ?? 0) + (a.sessions ?? 0);
        }
        return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10);
      }
    } catch { return []; }
  }

  if (source === "issues_by_status" || source === "issues_by_priority") {
    try {
      const raw = localStorage.getItem("hm-issues");
      if (!raw) return [];
      const issues = JSON.parse(raw) as Array<Record<string, string>>;
      const field = source === "issues_by_status" ? "status" : "priority";
      const counts: Record<string, number> = {};
      for (const issue of issues) {
        const key = issue[field] ?? "unknown";
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return Object.entries(counts).map(([label, value]) => ({ label, value }));
    } catch { return []; }
  }

  if (source === "time_by_project") {
    try {
      const entriesRaw = localStorage.getItem("hm-time-entries");
      const projectsRaw = localStorage.getItem("hm-projects");
      if (!entriesRaw) return [];
      const entries = JSON.parse(entriesRaw) as Array<{ projectId?: string; duration?: number; minutes?: number }>;
      const projects = projectsRaw ? (JSON.parse(projectsRaw) as Array<{ id: string; name: string }>) : [];
      const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
      const totals: Record<string, number> = {};
      for (const e of entries) {
        const key = (e.projectId && projectMap[e.projectId]) ? projectMap[e.projectId] : (e.projectId ?? "Unknown");
        totals[key] = (totals[key] ?? 0) + (e.duration ?? e.minutes ?? 0);
      }
      return Object.entries(totals).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value);
    } catch { return []; }
  }

  if (source === "focus_by_day") {
    try {
      const raw = localStorage.getItem("hm-session-log");
      if (!raw) return [];
      const log = JSON.parse(raw) as Array<{ completedAt?: string; date?: string }>;
      const counts: Record<string, number> = {};
      for (const entry of log) {
        const d = (entry.completedAt ?? entry.date ?? "").slice(0, 10);
        if (d) counts[d] = (counts[d] ?? 0) + 1;
      }
      return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label: label.slice(5), value }));
    } catch { return []; }
  }

  if (source === "workflow_runs") {
    try {
      const counts: Record<string, number> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith("hm-workflow-runs-")) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const runs = JSON.parse(raw) as Array<{ startedAt?: string; date?: string }>;
        for (const run of runs) {
          const d = (run.startedAt ?? run.date ?? "").slice(0, 10);
          if (d) counts[d] = (counts[d] ?? 0) + 1;
        }
      }
      return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label: label.slice(5), value }));
    } catch { return []; }
  }

  return [];
}

// ── SVG chart renderers ───────────────────────────────────────────────────────

const W = 400;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 36, left: 40 };

function yScale(data: DataPoint[], h: number): { max: number; step: number; ticks: number[] } {
  const max = Math.max(...data.map(d => d.value), 1);
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.ceil(raw / mag) * mag;
  const ticks = Array.from({ length: 5 }, (_, i) => i * step);
  return { max: ticks[4], step, ticks };
}

function renderBarChart(data: DataPoint[], opts: ChartOpts): React.ReactNode {
  if (!data.length) return <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-muted)" fontSize={11}>No data</text>;
  const { max, ticks } = yScale(data, H);
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };
  const bw = Math.min(36, (inner.w / data.length) * 0.65);
  const gap = inner.w / data.length;

  return (
    <g>
      {opts.showGrid && ticks.map(t => {
        const y = PAD.top + inner.h - (t / max) * inner.h;
        return <line key={t} x1={PAD.left} x2={PAD.left + inner.w} y1={y} y2={y} stroke="var(--border)" strokeWidth={0.5} />;
      })}
      {ticks.map(t => {
        const y = PAD.top + inner.h - (t / max) * inner.h;
        return <text key={t} x={PAD.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">{t}</text>;
      })}
      {data.map((d, i) => {
        const bh = Math.max(1, (d.value / max) * inner.h);
        const x = PAD.left + gap * i + (gap - bw) / 2;
        const y = PAD.top + inner.h - bh;
        const color = opts.colors[i % opts.colors.length];
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh} fill={color} rx={2}
              style={{ transition: opts.animate ? "height 0.5s ease, y 0.5s ease" : undefined }} />
            <text x={x + bw / 2} y={PAD.top + inner.h + 13} textAnchor="middle" fontSize={9} fill="var(--text-muted)"
              style={{ overflow: "hidden" }}>
              {d.label.length > 6 ? d.label.slice(0, 6) : d.label}
            </text>
            {opts.showLabels && <text x={x + bw / 2} y={y - 3} textAnchor="middle" fontSize={9} fill="var(--text-dim)">{d.value}</text>}
          </g>
        );
      })}
    </g>
  );
}

function renderHBarChart(data: DataPoint[], opts: ChartOpts): React.ReactNode {
  if (!data.length) return <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-muted)" fontSize={11}>No data</text>;
  const max = Math.max(...data.map(d => d.value), 1);
  const rows = data.slice(0, 8);
  const rowH = (H - PAD.top - 8) / rows.length;
  const labelW = 72;
  const barW = W - PAD.right - labelW - 8;

  return (
    <g>
      {opts.showGrid && [0.25, 0.5, 0.75, 1].map(f => {
        const x = labelW + barW * f;
        return <line key={f} x1={x} x2={x} y1={PAD.top} y2={H - 8} stroke="var(--border)" strokeWidth={0.5} />;
      })}
      {rows.map((d, i) => {
        const bw = (d.value / max) * barW;
        const y = PAD.top + rowH * i;
        const color = opts.colors[i % opts.colors.length];
        return (
          <g key={i}>
            <text x={labelW - 4} y={y + rowH / 2 + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">
              {d.label.length > 8 ? d.label.slice(0, 8) + "…" : d.label}
            </text>
            <rect x={labelW} y={y + 2} width={Math.max(1, bw)} height={rowH - 6} fill={color} rx={2}
              style={{ transition: opts.animate ? "width 0.5s ease" : undefined }} />
            {opts.showLabels && <text x={labelW + bw + 3} y={y + rowH / 2 + 3} fontSize={9} fill="var(--text-dim)">{d.value}</text>}
          </g>
        );
      })}
    </g>
  );
}

function renderLineChart(data: DataPoint[], opts: ChartOpts, area = false): React.ReactNode {
  if (!data.length) return <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-muted)" fontSize={11}>No data</text>;
  const { max, ticks } = yScale(data, H);
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };
  const pts = data.map((d, i) => ({
    x: PAD.left + (i / Math.max(data.length - 1, 1)) * inner.w,
    y: PAD.top + inner.h - (d.value / max) * inner.h,
  }));
  const polyline = pts.map(p => `${p.x},${p.y}`).join(" ");
  const areaPath = `M${pts[0].x},${PAD.top + inner.h} ` +
    pts.map(p => `L${p.x},${p.y}`).join(" ") +
    ` L${pts[pts.length - 1].x},${PAD.top + inner.h} Z`;
  const color = opts.colors[0];

  return (
    <g>
      {opts.showGrid && ticks.map(t => {
        const y = PAD.top + inner.h - (t / max) * inner.h;
        return <line key={t} x1={PAD.left} x2={PAD.left + inner.w} y1={y} y2={y} stroke="var(--border)" strokeWidth={0.5} />;
      })}
      {ticks.map(t => {
        const y = PAD.top + inner.h - (t / max) * inner.h;
        return <text key={t} x={PAD.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">{t}</text>;
      })}
      {area && <path d={areaPath} fill={color} opacity={0.15} />}
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={color} />
          <text x={p.x} y={PAD.top + inner.h + 13} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
            {data[i].label.length > 5 ? data[i].label.slice(0, 5) : data[i].label}
          </text>
          {opts.showLabels && <text x={p.x} y={p.y - 5} textAnchor="middle" fontSize={9} fill="var(--text-dim)">{data[i].value}</text>}
        </g>
      ))}
    </g>
  );
}

function renderPieChart(data: DataPoint[], opts: ChartOpts): React.ReactNode {
  if (!data.length) return <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-muted)" fontSize={11}>No data</text>;
  const cx = W / 2;
  const cy = H / 2 - (opts.showLegend ? 12 : 0);
  const r = Math.min(cx, cy) - 24;
  const ri = r * 0.55;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <text x={cx} y={cy} textAnchor="middle" fill="var(--text-muted)" fontSize={11}>No data</text>;

  let angle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const a1 = angle;
    const a2 = angle + sweep;
    angle = a2;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const ix1 = cx + ri * Math.cos(a1), iy1 = cy + ri * Math.sin(a1);
    const ix2 = cx + ri * Math.cos(a2), iy2 = cy + ri * Math.sin(a2);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${ri},${ri} 0 ${large} 0 ${ix1},${iy1} Z`;
    const midA = (a1 + a2) / 2;
    return { path, color: opts.colors[i % opts.colors.length], midA, label: d.label, value: d.value };
  });

  return (
    <g>
      {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="var(--bg-panel)" strokeWidth={1} />)}
      {opts.showLabels && slices.map((s, i) => {
        const lx = cx + (r + 10) * Math.cos(s.midA);
        const ly = cy + (r + 10) * Math.sin(s.midA);
        return <text key={i} x={lx} y={ly} textAnchor="middle" fontSize={8} fill="var(--text-dim)">{s.value}</text>;
      })}
      {opts.showLegend && (
        <g>
          {slices.slice(0, 5).map((s, i) => {
            const lx = 8 + i * (W / Math.min(slices.length, 5));
            return (
              <g key={i}>
                <rect x={lx} y={H - 16} width={8} height={8} fill={s.color} rx={1} />
                <text x={lx + 10} y={H - 8} fontSize={8} fill="var(--text-muted)">
                  {s.label.length > 7 ? s.label.slice(0, 7) + "…" : s.label}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
}

// ── Chart type icons ──────────────────────────────────────────────────────────

const CHART_ICONS: Record<ChartType, React.ReactNode> = {
  bar:  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="7" width="3" height="6" rx=".5" fill="currentColor" opacity=".5"/><rect x="5.5" y="4" width="3" height="9" rx=".5" fill="currentColor" opacity=".75"/><rect x="10" y="1" width="3" height="12" rx=".5" fill="currentColor"/></svg>,
  hbar: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="6" height="3" rx=".5" fill="currentColor" opacity=".5"/><rect x="1" y="5.5" width="9" height="3" rx=".5" fill="currentColor" opacity=".75"/><rect x="1" y="10" width="12" height="3" rx=".5" fill="currentColor"/></svg>,
  line: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="1,11 4,7 7,9 10,4 13,5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>,
  area: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1,13 L1,8 L4,5 L7,7 L10,3 L13,4 L13,13 Z" fill="currentColor" opacity=".25"/><polyline points="1,8 4,5 7,7 10,3 13,4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>,
  pie:  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7,7 L7,1 A6,6 0 0,1 13,7 Z" fill="currentColor"/><path d="M7,7 L13,7 A6,6 0 0,1 7,13 Z" fill="currentColor" opacity=".6"/><path d="M7,7 L7,13 A6,6 0 1,1 13,7 Z" fill="currentColor" opacity=".3"/></svg>,
};

const CHART_LABELS: Record<ChartType, string> = {
  bar: "Bar", hbar: "H-Bar", line: "Line", area: "Area", pie: "Pie/Donut",
};

// ── Mini thumbnail ────────────────────────────────────────────────────────────

function ChartThumbnail({ chart, data }: { chart: SavedChart; data: DataPoint[] }) {
  const opts: ChartOpts = {
    colors: PALETTES[chart.colorScheme],
    showGrid: chart.showGrid,
    showLabels: false,
    showLegend: chart.showLegend,
    animate: false,
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {chart.chartType === "bar" && renderBarChart(data, opts)}
      {chart.chartType === "hbar" && renderHBarChart(data, opts)}
      {chart.chartType === "line" && renderLineChart(data, opts)}
      {chart.chartType === "area" && renderLineChart(data, opts, true)}
      {chart.chartType === "pie" && renderPieChart(data, opts)}
    </svg>
  );
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORAGE_KEY = "hm-charts";

function loadCharts(): SavedChart[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SavedChart[];
  } catch { /* ignore */ }
  return [];
}

function saveCharts(charts: SavedChart[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(charts));
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Main component ────────────────────────────────────────────────────────────

export function DataVisualization() {
  const [charts, setCharts] = useState<SavedChart[]>(() => loadCharts());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("New Chart");
  const [source, setSource] = useState<DataSourceKey>("sessions_by_day");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [colorScheme, setColorScheme] = useState<ColorScheme>("accent");
  const [showLegend, setShowLegend] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [thumbData, setThumbData] = useState<Record<string, DataPoint[]>>({});
  const mounted = useRef(false);

  const fetchData = useCallback(async (src: DataSourceKey) => {
    setLoading(true);
    try {
      const d = await loadData(src);
      setData(d);
    } catch {
      toast.error("Failed to load data");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(source);
  }, [source, fetchData]);

  // Load thumbnail data for saved charts
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const sources = [...new Set(charts.map(c => c.source))];
    sources.forEach(src => {
      void loadData(src).then(d => {
        setThumbData(prev => ({ ...prev, [src]: d }));
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadChart = (chart: SavedChart) => {
    setEditingId(chart.id);
    setTitle(chart.title);
    setSource(chart.source);
    setChartType(chart.chartType);
    setColorScheme(chart.colorScheme);
    setShowLegend(chart.showLegend);
    setShowGrid(chart.showGrid);
    setShowLabels(chart.showLabels);
    void fetchData(chart.source);
  };

  const newChart = () => {
    setEditingId(null);
    setTitle("New Chart");
    setSource("sessions_by_day");
    setChartType("bar");
    setColorScheme("accent");
    setShowLegend(true);
    setShowGrid(true);
    setShowLabels(false);
    void fetchData("sessions_by_day");
  };

  const saveChart = () => {
    const chart: SavedChart = {
      id: editingId ?? genId(),
      title: title.trim() || "Untitled",
      source, chartType, colorScheme, showLegend, showGrid, showLabels,
    };
    setCharts(prev => {
      const next = editingId
        ? prev.map(c => c.id === editingId ? chart : c)
        : [...prev, chart];
      saveCharts(next);
      return next;
    });
    setThumbData(prev => ({ ...prev, [source]: data }));
    setEditingId(chart.id);
    toast.success("Chart saved");
  };

  const deleteChart = (id: string) => {
    setCharts(prev => {
      const next = prev.filter(c => c.id !== id);
      saveCharts(next);
      return next;
    });
    if (editingId === id) newChart();
  };

  const opts: ChartOpts = {
    colors: PALETTES[colorScheme],
    showGrid,
    showLabels,
    showLegend,
    animate: true,
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Left sidebar ── */}
      <div style={{
        width: 196, flexShrink: 0, borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--bg-panel)",
      }}>
        <div style={{ padding: "10px 10px 6px", flexShrink: 0 }}>
          <button
            onClick={newChart}
            style={{
              width: "100%", padding: "6px 10px", background: "var(--bg-elevated)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              cursor: "pointer", fontSize: 11, color: "var(--text)",
              fontFamily: "var(--font-sans)", textAlign: "left",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            + New Chart
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
          {charts.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px 4px" }}>
              No saved charts yet
            </div>
          )}
          {charts.map(c => (
            <div
              key={c.id}
              onClick={() => loadChart(c)}
              style={{
                marginBottom: 8, borderRadius: "var(--radius-sm)", overflow: "hidden",
                border: `1px solid ${editingId === c.id ? "var(--accent)" : "var(--border)"}`,
                cursor: "pointer", background: "var(--bg-elevated)", position: "relative",
              }}
              onMouseEnter={e => { if (editingId !== c.id) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--text-muted)"; }}
              onMouseLeave={e => { if (editingId !== c.id) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
            >
              <div style={{ padding: "0 4px" }}>
                <ChartThumbnail chart={c} data={thumbData[c.source] ?? []} />
              </div>
              <div style={{
                padding: "4px 8px 5px", display: "flex", alignItems: "center",
                justifyContent: "space-between", borderTop: "1px solid var(--border)",
              }}>
                <span style={{ fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {c.title}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); deleteChart(c.id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, lineHeight: 1, padding: "0 0 0 4px", flexShrink: 0 }}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Builder ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Controls */}
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid var(--border)",
          display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end",
          flexShrink: 0, background: "var(--bg-panel)",
        }}>
          {/* Title */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{
                background: "var(--bg-elevated)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", padding: "4px 8px",
                fontSize: 12, color: "var(--text)", fontFamily: "var(--font-sans)",
                width: 150, outline: "none",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>

          {/* Data source */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Data source</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value as DataSourceKey)}
              style={{
                background: "var(--bg-elevated)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", padding: "4px 8px",
                fontSize: 12, color: "var(--text)", fontFamily: "var(--font-sans)",
                cursor: "pointer", outline: "none",
              }}
            >
              {(Object.keys(SOURCE_LABELS) as DataSourceKey[]).map(k => (
                <option key={k} value={k}>{SOURCE_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {/* Chart type */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</label>
            <div style={{ display: "flex", gap: 2 }}>
              {(Object.keys(CHART_ICONS) as ChartType[]).map(t => (
                <button
                  key={t}
                  title={CHART_LABELS[t]}
                  onClick={() => setChartType(t)}
                  style={{
                    padding: "4px 7px", background: chartType === t ? "var(--bg-elevated)" : "none",
                    border: `1px solid ${chartType === t ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: "var(--radius-sm)", cursor: "pointer",
                    color: chartType === t ? "var(--accent)" : "var(--text-muted)",
                    display: "flex", alignItems: "center",
                  }}
                >
                  {CHART_ICONS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Color scheme */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Colors</label>
            <div style={{ display: "flex", gap: 3 }}>
              {(Object.keys(PALETTES) as ColorScheme[]).map(s => (
                <button
                  key={s}
                  title={PALETTE_LABELS[s]}
                  onClick={() => setColorScheme(s)}
                  style={{
                    width: 22, height: 22, borderRadius: "var(--radius-sm)", cursor: "pointer", padding: 0,
                    border: `2px solid ${colorScheme === s ? "var(--accent)" : "transparent"}`,
                    overflow: "hidden", display: "flex",
                  }}
                >
                  <div style={{ display: "flex", flex: 1 }}>
                    {PALETTES[s].slice(0, 3).map((c, i) => (
                      <div key={i} style={{ flex: 1, background: c }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            {([["showLegend", "Legend", showLegend], ["showGrid", "Grid", showGrid], ["showLabels", "Labels", showLabels]] as const).map(([key, label, val]) => (
              <button
                key={key}
                onClick={() => {
                  if (key === "showLegend") setShowLegend(v => !v);
                  if (key === "showGrid") setShowGrid(v => !v);
                  if (key === "showLabels") setShowLabels(v => !v);
                }}
                style={{
                  padding: "4px 8px", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)",
                  background: val ? "var(--bg-elevated)" : "none",
                  border: `1px solid ${val ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "var(--radius-sm)",
                  color: val ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <button
            onClick={saveChart}
            style={{
              padding: "5px 14px", background: "var(--accent)", border: "none",
              borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 12,
              color: "#fff", fontFamily: "var(--font-sans)", fontWeight: 500,
            }}
          >
            Save chart
          </button>
        </div>

        {/* Chart preview */}
        <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{title}</div>
          {loading ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Loading…</div>
          ) : (
            <div style={{ maxWidth: 640 }}>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                style={{ display: "block", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)" }}
              >
                {chartType === "bar" && renderBarChart(data, opts)}
                {chartType === "hbar" && renderHBarChart(data, opts)}
                {chartType === "line" && renderLineChart(data, opts)}
                {chartType === "area" && renderLineChart(data, opts, true)}
                {chartType === "pie" && renderPieChart(data, opts)}
              </svg>
              {data.length === 0 && !loading && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  No data found for this source. Make sure you have activity recorded.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
