"use client";

import type { CustomRule } from "@prisma/client";
import { Badge, Button } from "@fabrk/components";
import {
  toggleRule,
  deleteRule,
} from "@/app/(dashboard)/dashboard/settings/actions";

export function RuleCard({ rule }: { rule: CustomRule }) {
  return (
    <div className="flex items-start justify-between mono-box bg-card">
      <div className="flex-1">
        <div className="flex items-center gap-[var(--grid-2)]">
          <p className="type-body font-bold">{rule.name}</p>
          <Badge variant={rule.enabled ? "accent" : "secondary"} size="sm">
            {rule.enabled ? "ENABLED" : "DISABLED"}
          </Badge>
          <Badge variant="outline" size="sm">
            {rule.scope}
          </Badge>
        </div>
        {rule.description && (
          <p className="mt-[var(--grid-1)] type-caption text-muted-foreground">
            {rule.description}
          </p>
        )}
        <pre className="mt-[var(--grid-2)] border border-border bg-background p-[var(--grid-4)] type-caption text-muted-foreground">
          {rule.rule.length > 200
            ? `${rule.rule.slice(0, 200)}...`
            : rule.rule}
        </pre>
      </div>

      <div className="ml-4 flex gap-[var(--grid-2)]">
        <form action={toggleRule}>
          <input type="hidden" name="ruleId" value={rule.id} />
          <Button type="submit" variant="outline" size="sm">
            {rule.enabled ? "DISABLE" : "ENABLE"}
          </Button>
        </form>
        <form action={deleteRule}>
          <input type="hidden" name="ruleId" value={rule.id} />
          <Button type="submit" variant="ghost" size="sm">
            DELETE
          </Button>
        </form>
      </div>
    </div>
  );
}
