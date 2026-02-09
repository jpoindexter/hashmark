import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { PlanBadge } from "@/components/shared/plan-badge";

export const metadata = {
  title: "Billing — Hashmark",
};

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
      <h1 className="text-lg font-bold uppercase tracking-wider">BILLING</h1>

      <div className="border border-border bg-card px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              [CURRENT PLAN]
            </p>
            <div className="mt-2">
              <PlanBadge plan={user.plan} />
            </div>
          </div>

          {user.plan === "FREE" ? (
            <Link
              href="#pricing"
              className="border border-accent bg-accent/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {"> UPGRADE"}
            </Link>
          ) : (
            <form
              action="/api/billing/portal"
              method="POST"
            >
              <button
                type="submit"
                className="border border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {"> MANAGE SUBSCRIPTION"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Plan comparison */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            name: "FREE",
            price: "$0",
            features: ["1 repository", "Manual scans", "Download files"],
          },
          {
            name: "PRO",
            price: "$19/mo",
            features: [
              "Unlimited repos",
              "Auto-sync (GitHub Action)",
              "Custom rules",
              "Scan history",
            ],
          },
          {
            name: "TEAM",
            price: "$29/seat/mo",
            features: [
              "Everything in Pro",
              "Org-wide rules",
              "Team dashboard",
              "Priority support",
            ],
          },
        ].map((plan) => (
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
                <li
                  key={f}
                  className="text-xs text-muted-foreground"
                >
                  {`> ${f}`}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
