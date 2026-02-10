"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "INTELLIGENCE" },
  { href: "/files", label: "FILES" },
  { href: "/history", label: "HISTORY" },
  { href: "/settings", label: "SETTINGS" },
] as const;

export function RepoSubNav({ repoId }: { repoId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${repoId}`;

  return (
    <nav className="flex border-b border-border" aria-label="Repository sections">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const isActive =
          tab.href === ""
            ? pathname === base
            : pathname.startsWith(`${base}${tab.href}`);

        return (
          <Link
            key={tab.label}
            href={href}
            className={`border-b-2 px-6 py-4 type-nav transition-colors ${
              isActive
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
