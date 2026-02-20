"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { DashboardShell } from "@fabrk/components";
import { LayoutDashboard, GitBranch, Settings, CreditCard } from "lucide-react";
import { DashboardBreadcrumbs } from "./dashboard-breadcrumbs";
import { SearchDialog, SearchTrigger } from "./search-dialog";
import { ThemeToggle } from "@/components/theme-toggle";

const SIDEBAR_ITEMS = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutDashboard className="size-4" />,
    href: "/dashboard",
  },
  {
    id: "repos",
    label: "Repositories",
    icon: <GitBranch className="size-4" />,
    href: "/dashboard/repos",
  },
  {
    id: "settings",
    label: "Settings",
    icon: <Settings className="size-4" />,
    href: "/dashboard/settings",
  },
  {
    id: "billing",
    label: "Billing",
    icon: <CreditCard className="size-4" />,
    href: "/dashboard/billing",
  },
];

function getActiveItemId(pathname: string): string {
  if (pathname === "/dashboard") return "overview";
  if (pathname.startsWith("/dashboard/repos") || pathname.match(/^\/dashboard\/[^/]+/)) {
    if (
      !pathname.startsWith("/dashboard/settings") &&
      !pathname.startsWith("/dashboard/billing")
    ) {
      return "repos";
    }
  }
  if (pathname.startsWith("/dashboard/settings")) return "settings";
  if (pathname.startsWith("/dashboard/billing")) return "billing";
  return "overview";
}

export function DashboardShellWrapper({
  user,
  children,
}: {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    plan: string;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeItemId = getActiveItemId(pathname);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <DashboardShell
      sidebarItems={SIDEBAR_ITEMS}
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        tier: user.plan.toLowerCase(),
      }}
      logo={<span className="text-xl font-bold text-accent">#</span>}
      title="HASHMARK"
      activeItemId={activeItemId}
      onSignOut={() => signOut({ callbackUrl: "/login" })}
      linkComponent={Link}
    >
      <div className="mx-auto max-w-7xl p-[var(--grid-6)]">
        <div className="mb-[var(--grid-4)] flex items-center justify-between">
          <DashboardBreadcrumbs />
          <div className="flex items-center gap-[var(--grid-2)]">
            <SearchTrigger onOpen={() => setSearchOpen(true)} />
            <ThemeToggle />
          </div>
        </div>
        {children}
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </DashboardShell>
  );
}
