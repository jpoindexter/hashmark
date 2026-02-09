"use client";

import { useState } from "react";
import Image from "next/image";
import type { CustomRule, User } from "@prisma/client";
import { PlanBadge } from "@/components/shared/plan-badge";
import { RuleCard } from "./rule-card";
import { RuleDialog } from "./rule-dialog";

export function SettingsPage({
  user,
  rules,
}: {
  user: Pick<User, "id" | "name" | "email" | "image" | "plan">;
  rules: CustomRule[];
}) {
  const [showAddRule, setShowAddRule] = useState(false);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-bold uppercase tracking-wider">SETTINGS</h1>

      {/* Profile section */}
      <section>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          [ PROFILE ]
        </h2>
        <div className="border border-border bg-card px-6 py-4">
          <div className="flex items-center gap-4">
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
              <p className="font-bold">{user.name ?? "Developer"}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <div className="mt-1">
                <PlanBadge plan={user.plan} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Custom rules section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            [ CUSTOM RULES ] ({rules.length})
          </h2>
          <button
            onClick={() => setShowAddRule(true)}
            className="border border-accent bg-accent/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {"> ADD RULE"}
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="border border-dashed border-border p-8 text-center">
            <p className="text-sm uppercase tracking-wider text-muted-foreground">
              NO CUSTOM RULES
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Custom rules are injected into all generated context files
            </p>
          </div>
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
