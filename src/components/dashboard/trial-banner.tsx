import Link from "next/link";
import { Button } from "@fabrk/components";

export function TrialBanner() {
  return (
    <div className="flex items-center justify-between mono-box border-accent/20 bg-accent/4">
      <div>
        <p className="type-label text-accent">
          [FREE PLAN]
        </p>
        <p className="mt-1 type-caption text-muted-foreground">
          Upgrade to Pro for unlimited repos, auto-sync, and custom rules.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard/billing">{"> UPGRADE"}</Link>
      </Button>
    </div>
  );
}
