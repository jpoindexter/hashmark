import { Button } from "@fabrk/components";
import { Search } from "lucide-react";
import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-[var(--grid-6)]">
      <div className="flex flex-col items-center gap-[var(--grid-4)] mono-box border-border bg-card text-center max-w-md">
        <Search className="h-12 w-12 text-muted-foreground" />
        <h2 className="type-h2 text-muted-foreground">[404_NOT_FOUND]</h2>
        <p className="type-body text-muted-foreground">
          The page or repository you are looking for does not exist or has been disconnected.
        </p>
        <div className="mt-[var(--grid-4)]">
          <Button asChild>
            <Link href="/dashboard">
              {"> BACK TO DASHBOARD"}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
