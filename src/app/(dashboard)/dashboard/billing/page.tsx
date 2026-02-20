import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DashboardHeader, TierBadge } from "@fabrk/components";
import {
  UpgradeButton,
  ManageSubscriptionButton,
  PlanSelectButton,
} from "@/components/dashboard/billing-actions";
import { Database, GitBranch, Scan, FileCode } from "lucide-react";

export const metadata = {
  title: "Billing — Hashmark",
};

const PLANS = [
  {
    name: "FREE" as const,
    price: "$0",
    priceId: "",
    features: ["1 repository", "Manual scans", "Download files"],
  },
  {
    name: "PRO" as const,
    price: "$19/mo",
    priceId: process.env.POLAR_PRO_PRODUCT_ID ?? "",
    features: [
      "Unlimited repos",
      "Auto-sync (GitHub Action)",
      "Custom rules",
      "Scan history",
    ],
  },
  {
    name: "TEAM" as const,
    price: "$29/seat/mo",
    priceId: process.env.POLAR_TEAM_PRODUCT_ID ?? "",
    features: [
      "Everything in Pro",
      "Shared team billing",
      "Priority support",
      "Early access to new features",
    ],
  },
];

const PLAN_LIMITS = {
  FREE: { repos: 1, scans: "Manual only", rules: 0, autoSync: false },
  PRO: {
    repos: "Unlimited",
    scans: "Unlimited",
    rules: "Unlimited",
    autoSync: true,
  },
  TEAM: {
    repos: "Unlimited",
    scans: "Unlimited",
    rules: "Unlimited",
    autoSync: true,
  },
} as const;

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, repoCount, scanCount, fileCount] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, createdAt: true },
    }),
    db.repository.count({ where: { userId: session.user.id } }),
    db.scan.count({
      where: {
        repository: { userId: session.user.id },
        status: "COMPLETED",
      },
    }),
    db.generatedFile.count({
      where: { scan: { repository: { userId: session.user.id } } },
    }),
  ]);

  if (!user) redirect("/login");

  const limits = PLAN_LIMITS[user.plan];

  return (
    <div className="mono-stack-lg">
      <DashboardHeader title="BILLING" />

      {/* Current plan + manage */}
      <div className="mono-box bg-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="type-label text-muted-foreground">
              [CURRENT PLAN]
            </p>
            <div className="mt-[var(--grid-2)] flex items-center gap-[var(--grid-3)]">
              <TierBadge tier={user.plan.toLowerCase()} size="lg" />
              <span className="type-caption text-muted-foreground">
                Member since{" "}
                {user.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>

          {user.plan === "FREE" ? (
            <UpgradeButton productId={PLANS[1].priceId} />
          ) : (
            <ManageSubscriptionButton />
          )}
        </div>
      </div>

      {/* Usage stats */}
      <div className="mono-grid-4">
        <UsageStat
          icon={<GitBranch className="h-4 w-4" />}
          label="REPOSITORIES"
          value={repoCount}
          limit={typeof limits.repos === "number" ? limits.repos : undefined}
        />
        <UsageStat
          icon={<Scan className="h-4 w-4" />}
          label="SCANS"
          value={scanCount}
        />
        <UsageStat
          icon={<FileCode className="h-4 w-4" />}
          label="FILES GENERATED"
          value={fileCount}
        />
        <UsageStat
          icon={<Database className="h-4 w-4" />}
          label="AUTO-SYNC"
          value={limits.autoSync ? "ENABLED" : "OFF"}
        />
      </div>

      {/* Plan comparison */}
      <div>
        <p className="mb-[var(--grid-4)] type-label text-muted-foreground">
          [AVAILABLE PLANS]
        </p>
        <div id="pricing" className="mono-grid-3 gap-[var(--grid-4)]">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`border px-[var(--grid-6)] py-[var(--grid-4)] ${
                user.plan === plan.name
                  ? "border-accent bg-accent/5"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="type-label">
                  [{plan.name}]
                </p>
                {user.plan === plan.name && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                    CURRENT
                  </span>
                )}
              </div>
              <p className="mt-[var(--grid-1)] text-xl font-bold">{plan.price}</p>
              <ul className="mt-[var(--grid-4)] space-y-1">
                {plan.features.map((f) => (
                  <li key={f} className="type-caption text-muted-foreground">
                    {`> ${f}`}
                  </li>
                ))}
              </ul>
              {plan.name !== "FREE" && (
                <PlanSelectButton
                  productId={plan.priceId}
                  isCurrent={user.plan === plan.name}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsageStat({
  icon,
  label,
  value,
  limit,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  limit?: number;
}) {
  const isAtLimit = typeof limit === "number" && typeof value === "number" && value >= limit;

  return (
    <div className="mono-box bg-card">
      <div className="flex items-center gap-[var(--grid-2)] text-muted-foreground">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-wider">
          {label}
        </p>
      </div>
      <div className="mt-[var(--grid-2)] flex items-baseline gap-[var(--grid-1)]">
        <p className="text-xl font-bold">{value}</p>
        {typeof limit === "number" && (
          <span
            className={`text-xs ${isAtLimit ? "text-destructive" : "text-muted-foreground"}`}
          >
            / {limit}
          </span>
        )}
      </div>
      {isAtLimit && (
        <p className="mt-[var(--grid-1)] text-[10px] uppercase text-destructive">
          LIMIT REACHED
        </p>
      )}
    </div>
  );
}
