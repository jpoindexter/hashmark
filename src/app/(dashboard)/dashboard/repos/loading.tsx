export default function ReposLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse bg-muted" />
          <div className="h-4 w-32 animate-pulse bg-muted" />
        </div>
        <div className="h-10 w-36 animate-pulse bg-muted" />
      </div>

      {/* Search skeleton */}
      <div className="h-10 w-full animate-pulse bg-muted" />

      {/* Repo cards skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border border-border px-6 py-4"
          >
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-4">
                <div className="h-4 w-48 animate-pulse bg-muted" />
                <div className="h-5 w-16 animate-pulse bg-muted" />
              </div>
              <div className="flex gap-4">
                <div className="h-3 w-24 animate-pulse bg-muted" />
                <div className="h-3 w-32 animate-pulse bg-muted" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-20 animate-pulse bg-muted" />
              <div className="h-8 w-8 animate-pulse bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
