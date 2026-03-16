export default function FilesLoading() {
  return (
    <div className="mono-stack">
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 animate-pulse bg-muted" />
        <div className="h-9 w-40 animate-pulse bg-muted" />
      </div>
      <div className="flex gap-[var(--grid-4)]">
        <div className="w-64 shrink-0 border border-border">
          <div className="border-b border-border px-[var(--grid-4)] py-[var(--grid-4)]">
            <div className="h-3 w-20 animate-pulse bg-muted" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-border px-[var(--grid-4)] py-[var(--grid-3)]">
              <div className="h-3 w-28 animate-pulse bg-muted" />
            </div>
          ))}
        </div>
        <div className="flex-1 border border-border">
          <div className="border-b border-border px-[var(--grid-4)] py-[var(--grid-4)]">
            <div className="h-3 w-32 animate-pulse bg-muted" />
          </div>
          <div className="p-[var(--grid-4)] space-y-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-3 animate-pulse bg-muted" style={{ width: `${60 + (i % 4) * 10}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
