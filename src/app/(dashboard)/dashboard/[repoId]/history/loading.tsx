export default function HistoryLoading() {
  return (
    <div className="mono-stack">
      <div className="h-4 w-28 animate-pulse bg-muted" />
      <div className="border border-border">
        <div className="border-b border-border bg-muted px-[var(--grid-4)] py-[var(--grid-3)]">
          <div className="flex gap-16">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 w-12 animate-pulse bg-muted/50" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-16 border-b border-border px-[var(--grid-4)] py-[var(--grid-3)] last:border-0">
            <div className="h-4 w-16 animate-pulse bg-muted" />
            <div className="h-4 w-36 animate-pulse bg-muted" />
            <div className="h-4 w-12 animate-pulse bg-muted" />
            <div className="h-4 w-14 animate-pulse bg-muted" />
            <div className="h-4 w-14 animate-pulse bg-muted" />
            <div className="h-4 w-10 animate-pulse bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
