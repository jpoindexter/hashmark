import Link from "next/link";
import { Button } from "@fabrk/components";

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
      <Button asChild>
        <Link href="/dashboard/billing">{"> UPGRADE"}</Link>
      </Button>
    </div>
  );
}
