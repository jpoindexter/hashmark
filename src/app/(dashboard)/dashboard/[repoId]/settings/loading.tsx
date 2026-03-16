export default function RepoSettingsLoading() {
  return (
    <div className="mono-stack-lg">
      {["AUTO-SYNC", "SCAN CONFIGURATION", "ABOUT SCAN ROOT"].map((title) => (
        <section key={title}>
          <div className="h-3 w-40 animate-pulse bg-muted mb-[var(--grid-4)]" />
          <div className="mono-box bg-card space-y-3">
            <div className="h-4 w-48 animate-pulse bg-muted" />
            <div className="h-3 w-full animate-pulse bg-muted" />
            <div className="h-3 w-3/4 animate-pulse bg-muted" />
          </div>
        </section>
      ))}
    </div>
  );
}
