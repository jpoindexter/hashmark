export default function RepoLoading() {
  return (
    <div className="mono-stack-lg">
      {/* Scan info bar skeleton */}
      <div className="flex items-center justify-between mono-box bg-card">
        <div className="flex items-center gap-[var(--grid-4)]">
          <div className="h-5 w-24 animate-pulse bg-muted" />
          <div className="h-3 w-32 animate-pulse bg-muted" />
        </div>
        <div className="h-10 w-28 animate-pulse bg-muted" />
      </div>

      {/* KPI Grid skeleton */}
      <div className="mono-grid-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border border-border px-[var(--grid-6)] py-[var(--grid-4)]">
            <div className="h-3 w-20 animate-pulse bg-muted" />
            <div className="mt-[var(--grid-2)] h-8 w-16 animate-pulse bg-muted" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="mono-stack">
        <div className="h-3 w-32 animate-pulse bg-muted" />
        <div className="border border-border">
          <div className="border-b border-border bg-muted px-[var(--grid-4)] py-[var(--grid-3)]">
            <div className="flex gap-16">
              <div className="h-3 w-16 animate-pulse bg-muted/50" />
              <div className="h-3 w-16 animate-pulse bg-muted/50" />
              <div className="h-3 w-16 animate-pulse bg-muted/50" />
            </div>
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-16 border-b border-border px-[var(--grid-4)] py-[var(--grid-3)] last:border-0"
            >
              <div className="h-4 w-24 animate-pulse bg-muted" />
              <div className="h-4 w-48 animate-pulse bg-muted" />
              <div className="h-4 w-16 animate-pulse bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
