export default function SettingsLoading() {
  return (
    <div className="mono-stack-lg">
      {/* Header skeleton */}
      <div className="h-8 w-32 animate-pulse bg-muted" />

      {/* Profile section skeleton */}
      <section className="space-y-4">
        <div className="h-3 w-20 animate-pulse bg-muted" />
        <div className="border border-border bg-card px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 animate-pulse bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-40 animate-pulse bg-muted" />
              <div className="h-3 w-48 animate-pulse bg-muted" />
              <div className="h-5 w-16 animate-pulse bg-muted" />
            </div>
          </div>
        </div>
      </section>

      {/* Rules section skeleton */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-3 w-36 animate-pulse bg-muted" />
          <div className="h-10 w-28 animate-pulse bg-muted" />
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="border border-border px-6 py-4">
            <div className="space-y-2">
              <div className="h-4 w-48 animate-pulse bg-muted" />
              <div className="h-3 w-64 animate-pulse bg-muted" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
