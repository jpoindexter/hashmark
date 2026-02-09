import { Badge } from "@fabrk/components";
import type { ScanStatus } from "@prisma/client";

const statusConfig: Record<
  ScanStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "accent" }
> = {
  PENDING: { label: "PENDING", variant: "secondary" },
  SCANNING: { label: "SCANNING", variant: "accent" },
  COMPLETED: { label: "COMPLETED", variant: "default" },
  FAILED: { label: "FAILED", variant: "destructive" },
};

export function StatusBadge({ status }: { status: ScanStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant}>
      {status === "SCANNING" && (
        <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
      )}
      {config.label}
    </Badge>
  );
}
