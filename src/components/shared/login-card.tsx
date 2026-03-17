"use client";

import { useSearchParams } from "next/navigation";
import { OAuthButtons } from "./oauth-buttons";

const PLAN_LABELS: Record<string, string> = {
  pro: "PRO — $19/mo",
  team: "TEAM — $29/seat/mo",
};

export function LoginCard() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");
  const isPaid = plan === "pro" || plan === "team";
  const callbackUrl = isPaid ? "/dashboard/billing" : "/dashboard";

  return (
    <div className="w-full max-w-md mono-box bg-card">
      <div className="mb-[var(--grid-8)] text-center">
        <div className="mb-[var(--grid-4)] type-h1 text-accent">#</div>
        <h1 className="type-h2">HASHMARK</h1>
        <p className="mt-[var(--grid-2)] type-body text-muted-foreground">
          One scan. Every format. Always in sync.
        </p>
      </div>

      {isPaid && (
        <div className="mb-[var(--grid-6)] border border-accent/30 bg-accent/5 px-[var(--grid-4)] py-[var(--grid-3)] text-center">
          <p className="type-caption text-muted-foreground">SELECTED PLAN</p>
          <p className="mt-[var(--grid-1)] type-label text-accent">[{PLAN_LABELS[plan!]}]</p>
          <p className="mt-[var(--grid-1)] type-caption text-muted-foreground">
            Sign in to complete your upgrade
          </p>
        </div>
      )}

      <div className="mb-[var(--grid-6)] border-t border-border" />

      <div className="space-y-[var(--grid-4)]">
        <p className="text-center type-label text-muted-foreground">
          [AUTH]: SIGN IN TO CONTINUE
        </p>
        <OAuthButtons callbackUrl={callbackUrl} />
      </div>

      <div className="mt-[var(--grid-6)] text-center">
        <p className="type-caption text-muted-foreground">
          We&apos;ll request access to your repositories to scan and generate
          context files.
        </p>
      </div>
    </div>
  );
}
