export default function DashboardLoading() {
  return (
    <div className="mono-stack-lg">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse bg-muted" />
        <div className="h-4 w-64 animate-pulse bg-muted" />
      </div>

      {/* Stats grid skeleton */}
      <div className="mono-grid-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-border px-[var(--grid-6)] py-[var(--grid-4)]">
            <div className="h-3 w-24 animate-pulse bg-muted" />
            <div className="mt-[var(--grid-2)] h-8 w-16 animate-pulse bg-muted" />
          </div>
        ))}
      </div>

      {/* Quick actions skeleton */}
      <div className="space-y-4">
        <div className="h-3 w-32 animate-pulse bg-muted" />
        <div className="flex gap-[var(--grid-4)]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 w-36 animate-pulse bg-muted" />
          ))}
        </div>
      </div>

      {/* Activity skeleton */}
      <div className="space-y-4">
        <div className="h-3 w-36 animate-pulse bg-muted" />
        <div className="border border-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-border px-[var(--grid-6)] py-[var(--grid-4)] last:border-0"
            >
              <div className="flex items-center gap-[var(--grid-4)]">
                <div className="h-5 w-20 animate-pulse bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-4 w-40 animate-pulse bg-muted" />
                  <div className="h-3 w-56 animate-pulse bg-muted" />
                </div>
              </div>
              <div className="h-3 w-12 animate-pulse bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
