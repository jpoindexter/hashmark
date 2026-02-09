import Link from "next/link";

export function TrialBanner() {
  return (
    <div className="flex items-center justify-between border border-accent/20 bg-accent/4 px-6 py-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-accent">
          [FREE PLAN]
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Upgrade to Pro for unlimited repos, auto-sync, and custom rules.
        </p>
      </div>
      <Link
        href="/dashboard/billing"
        className="shrink-0 border border-accent bg-accent/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {"> UPGRADE"}
      </Link>
    </div>
  );
}
