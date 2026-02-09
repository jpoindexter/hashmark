"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Plan } from "@prisma/client";
import { PlanBadge } from "@/components/shared/plan-badge";

interface SidebarUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  plan: Plan;
}

const PRIMARY_NAV = [
  { href: "/dashboard", label: "OVERVIEW", icon: "#" },
  { href: "/dashboard/repos", label: "REPOSITORIES", icon: ">" },
] as const;

const SECONDARY_NAV = [
  { href: "/dashboard/settings", label: "SETTINGS", icon: "*" },
  { href: "/dashboard/billing", label: "BILLING", icon: "$" },
] as const;

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-card">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-accent">#</span>
          <span className="text-sm font-bold uppercase tracking-wider">
            HASHMARK
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4" aria-label="Dashboard navigation">
        <ul className="space-y-1">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <NavLink href={item.href} icon={item.icon} label={item.label} active={isActive(item.href)} />
            </li>
          ))}
        </ul>

        {/* Separator between nav groups */}
        <div className="my-4 border-t border-border" />

        <ul className="space-y-1">
          {SECONDARY_NAV.map((item) => (
            <li key={item.href}>
              <NavLink href={item.href} icon={item.icon} label={item.label} active={isActive(item.href)} />
            </li>
          ))}
        </ul>
      </nav>

      {/* User section */}
      <div className="border-t border-border p-4">
        <div className="mb-4 flex items-center gap-2">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? "User"}
              width={32}
              height={32}
              className="h-8 w-8 border border-border"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center border border-border bg-muted text-xs font-bold text-muted-foreground">
              {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-xs font-medium">
              {user.name ?? "Developer"}
            </p>
            <PlanBadge plan={user.plan} />
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full border border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          {"> SIGN OUT"}
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
        active
          ? "bg-accent/10 text-accent"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <span className="w-4 text-center font-bold">{icon}</span>
      {label}
    </Link>
  );
}
