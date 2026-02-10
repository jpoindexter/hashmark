export default function BillingLoading() {
  return (
    <div className="mono-stack-lg">
      {/* Header skeleton */}
      <div className="h-8 w-24 animate-pulse bg-muted" />

      {/* Current plan skeleton */}
      <div className="border border-border bg-card px-[var(--grid-6)] py-[var(--grid-6)]">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-3 w-24 animate-pulse bg-muted" />
            <div className="h-8 w-16 animate-pulse bg-muted" />
          </div>
          <div className="h-10 w-28 animate-pulse bg-muted" />
        </div>
      </div>

      {/* Plan cards skeleton */}
      <div className="mono-grid-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-border px-[var(--grid-6)] py-[var(--grid-4)]">
            <div className="h-3 w-16 animate-pulse bg-muted" />
            <div className="mt-[var(--grid-2)] h-6 w-20 animate-pulse bg-muted" />
            <div className="mt-[var(--grid-4)] space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-3 w-32 animate-pulse bg-muted" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
