import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DashboardHeader, TierBadge } from "@fabrk/components";
import {
  UpgradeButton,
  ManageSubscriptionButton,
  PlanSelectButton,
} from "@/components/dashboard/billing-actions";

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
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? "",
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
    priceId: process.env.STRIPE_TEAM_PRICE_ID ?? "",
    features: [
      "Everything in Pro",
      "Org-wide rules",
      "Team dashboard",
      "Priority support",
    ],
  },
];

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true, stripeCustomerId: true },
  });

  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <DashboardHeader title="BILLING" />

      <div className="border border-border bg-card px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              [CURRENT PLAN]
            </p>
            <div className="mt-2">
              <TierBadge tier={user.plan.toLowerCase()} size="lg" />
            </div>
          </div>

          {user.plan === "FREE" ? (
            <UpgradeButton priceId={PLANS[1].priceId} />
          ) : (
            <ManageSubscriptionButton />
          )}
        </div>
      </div>

      {/* Plan comparison */}
      <div id="pricing" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`border px-6 py-4 ${
              user.plan === plan.name
                ? "border-accent bg-accent/5"
                : "border-border bg-card"
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-wider">
              [{plan.name}]
            </p>
            <p className="mt-1 text-xl font-bold">{plan.price}</p>
            <ul className="mt-4 space-y-1">
              {plan.features.map((f) => (
                <li key={f} className="text-xs text-muted-foreground">
                  {`> ${f}`}
                </li>
              ))}
            </ul>
            {plan.name !== "FREE" && (
              <PlanSelectButton
                priceId={plan.priceId}
                isCurrent={user.plan === plan.name}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
