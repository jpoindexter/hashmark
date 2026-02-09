"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@fabrk/components";

const SEGMENT_LABELS: Record<string, string> = {
  repos: "REPOSITORIES",
  settings: "SETTINGS",
  billing: "BILLING",
  files: "FILES",
  history: "HISTORY",
};

interface Crumb {
  label: string;
  href: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  // Remove /dashboard prefix and split
  const stripped = pathname.replace(/^\/dashboard\/?/, "");
  if (!stripped) return [];

  const segments = stripped.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let path = "/dashboard";

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const label = SEGMENT_LABELS[segment];
    path += `/${segment}`;

    if (label) {
      crumbs.push({ label, href: path });
    } else {
      // Dynamic segment (repoId) — link back to repos list
      // but label it as the repo detail level
      crumbs.push({ label: "REPO", href: path });
    }
  }

  return crumbs;
}

export function DashboardBreadcrumbs() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  // Don't show breadcrumbs on dashboard root
  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/dashboard">DASHBOARD</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={crumb.href} className="contents">
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
