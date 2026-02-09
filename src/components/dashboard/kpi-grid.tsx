interface KpiGridProps {
  fileCount: number;
  lineCount: number;
  componentCount: number;
  apiRouteCount: number;
  modelCount: number;
  tokenEstimate: number;
  duration: number;
}

const kpis = [
  { key: "fileCount", label: "FILES", format: (v: number) => v.toLocaleString() },
  { key: "lineCount", label: "LINES", format: (v: number) => v.toLocaleString() },
  { key: "componentCount", label: "COMPONENTS", format: (v: number) => String(v) },
  { key: "apiRouteCount", label: "API ROUTES", format: (v: number) => String(v) },
  { key: "modelCount", label: "MODELS", format: (v: number) => String(v) },
  {
    key: "tokenEstimate",
    label: "EST. TOKENS",
    format: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)),
  },
  {
    key: "duration",
    label: "SCAN TIME",
    format: (v: number) => `${(v / 1000).toFixed(1)}s`,
  },
] as const;

export function KpiGrid(props: KpiGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
      {kpis.map((kpi) => {
        const value = props[kpi.key as keyof KpiGridProps];
        return (
          <div key={kpi.key} className="border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              [{kpi.label}]
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {kpi.format(value)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
