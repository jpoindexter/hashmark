"use client";

import { useState } from "react";
import Image from "next/image";
import type { CustomRule, User } from "@prisma/client";
import { DashboardHeader, TierBadge, EmptyState, Button } from "@fabrk/components";
import { ScrollText } from "lucide-react";
import { RuleCard } from "./rule-card";
import { RuleDialog } from "./rule-dialog";
import { UpgradeGate } from "@/components/shared/upgrade-gate";

export function SettingsPage({
  user,
  rules,
}: {
  user: Pick<User, "id" | "name" | "email" | "image" | "plan">;
  rules: CustomRule[];
}) {
  const [showAddRule, setShowAddRule] = useState(false);

  return (
    <div className="mono-stack-lg">
      <DashboardHeader title="SETTINGS" />

      {/* Profile section */}
      <section>
        <h2 className="mono-section-title text-muted-foreground">
          PROFILE
        </h2>
        <div className="mono-box bg-card">
          <div className="flex items-center gap-[var(--grid-4)]">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name ?? "User"}
                width={48}
                height={48}
                className="h-12 w-12 border border-border"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center border border-border bg-muted text-lg font-bold text-muted-foreground">
                {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="type-body font-bold">{user.name ?? "Developer"}</p>
              <p className="type-caption text-muted-foreground">{user.email}</p>
              <div className="mt-[var(--grid-1)]">
                <TierBadge tier={user.plan.toLowerCase()} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Custom rules section */}
      <section>
        <div className="mb-[var(--grid-4)] flex items-center justify-between">
          <h2 className="mono-section-title text-muted-foreground">
            CUSTOM RULES ({rules.length})
          </h2>
          {user.plan !== "FREE" && (
            <Button onClick={() => setShowAddRule(true)}>
              {"> ADD RULE"}
            </Button>
          )}
        </div>

        {user.plan === "FREE" ? (
          <UpgradeGate
            feature="CUSTOM RULES"
            description="Custom rules are a Pro feature. Add rules that get injected into every generated context file — enforce team conventions, design system usage, and coding patterns."
            requiredPlan="PRO"
          />
        ) : rules.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="NO CUSTOM RULES"
            description="Custom rules are injected into all generated context files"
            action={{
              label: "> ADD RULE",
              onClick: () => setShowAddRule(true),
            }}
          />
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        )}
      </section>

      {showAddRule && <RuleDialog onClose={() => setShowAddRule(false)} />}
    </div>
  );
}
