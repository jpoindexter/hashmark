"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Plan } from "@prisma/client";
import { PlanBadge } from "@/components/shared/plan-badge";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "DASHBOARD",
  repos: "REPOSITORIES",
  settings: "SETTINGS",
  billing: "BILLING",
  files: "FILES",
  history: "HISTORY",
};

export function DashboardHeader({ plan }: { plan: Plan }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Build breadcrumb items from path segments
  const crumbs = segments.map((segment, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = ROUTE_LABELS[segment] ?? segment.toUpperCase();
    const isLast = i === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <header className="flex h-12 items-center justify-between border-b border-border px-6">
      <nav className="flex items-center gap-2 text-xs" aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-muted-foreground" aria-hidden="true">
                {">"}
              </span>
            )}
            {crumb.isLast ? (
              <span className="font-bold uppercase tracking-wider text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
        <PlanBadge plan={plan} />
      </nav>
    </header>
  );
}
