export default function ComplexityLoading() {
  return (
    <div className="mono-stack-lg">
      {/* Stats grid skeleton */}
      <div className="mono-grid-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-border px-[var(--grid-6)] py-[var(--grid-4)]">
            <div className="h-3 w-24 animate-pulse bg-muted" />
            <div className="mt-[var(--grid-2)] h-8 w-12 animate-pulse bg-muted" />
          </div>
        ))}
      </div>

      {/* Function hotspots table skeleton */}
      <div className="mono-stack">
        <div className="h-3 w-40 animate-pulse bg-muted" />
        <div className="border border-border">
          <div className="border-b border-border bg-muted px-[var(--grid-4)] py-[var(--grid-3)]">
            <div className="flex gap-12">
              <div className="h-3 w-20 animate-pulse bg-muted/50" />
              <div className="h-3 w-24 animate-pulse bg-muted/50" />
              <div className="h-3 w-8 animate-pulse bg-muted/50" />
              <div className="h-3 w-16 animate-pulse bg-muted/50" />
              <div className="h-3 w-8 animate-pulse bg-muted/50" />
              <div className="h-3 w-12 animate-pulse bg-muted/50" />
            </div>
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-12 border-b border-border px-[var(--grid-4)] py-[var(--grid-3)] last:border-0"
            >
              <div className="h-4 w-28 animate-pulse bg-muted" />
              <div className="h-4 w-40 animate-pulse bg-muted" />
              <div className="h-4 w-8 animate-pulse bg-muted" />
              <div className="h-4 w-8 animate-pulse bg-muted" />
              <div className="h-4 w-8 animate-pulse bg-muted" />
              <div className="h-4 w-16 animate-pulse bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {/* File scores table skeleton */}
      <div className="mono-stack">
        <div className="h-3 w-48 animate-pulse bg-muted" />
        <div className="border border-border">
          <div className="border-b border-border bg-muted px-[var(--grid-4)] py-[var(--grid-3)]">
            <div className="flex gap-16">
              <div className="h-3 w-16 animate-pulse bg-muted/50" />
              <div className="h-3 w-12 animate-pulse bg-muted/50" />
              <div className="h-3 w-12 animate-pulse bg-muted/50" />
              <div className="h-3 w-8 animate-pulse bg-muted/50" />
            </div>
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-16 border-b border-border px-[var(--grid-4)] py-[var(--grid-3)] last:border-0"
            >
              <div className="h-4 w-48 animate-pulse bg-muted" />
              <div className="h-4 w-16 animate-pulse bg-muted" />
              <div className="h-4 w-12 animate-pulse bg-muted" />
              <div className="h-4 w-8 animate-pulse bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
