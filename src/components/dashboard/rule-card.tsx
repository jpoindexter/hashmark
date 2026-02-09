"use client";

import type { CustomRule } from "@prisma/client";
import {
  toggleRule,
  deleteRule,
} from "@/app/(dashboard)/dashboard/settings/actions";

export function RuleCard({ rule }: { rule: CustomRule }) {
  return (
    <div className="flex items-start justify-between border border-border bg-card px-6 py-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold">{rule.name}</p>
          <span
            className={`text-[10px] uppercase tracking-wider ${
              rule.enabled ? "text-accent" : "text-muted-foreground"
            }`}
          >
            {rule.enabled ? "ENABLED" : "DISABLED"}
          </span>
          <span className="border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {rule.scope}
          </span>
        </div>
        {rule.description && (
          <p className="mt-1 text-xs text-muted-foreground">
            {rule.description}
          </p>
        )}
        <pre className="mt-2 border border-border bg-background p-4 text-xs text-muted-foreground">
          {rule.rule.length > 200
            ? `${rule.rule.slice(0, 200)}...`
            : rule.rule}
        </pre>
      </div>

      <div className="ml-4 flex gap-2">
        <form action={toggleRule}>
          <input type="hidden" name="ruleId" value={rule.id} />
          <button
            type="submit"
            className="border border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {rule.enabled ? "DISABLE" : "ENABLE"}
          </button>
        </form>
        <form action={deleteRule}>
          <input type="hidden" name="ruleId" value={rule.id} />
          <button
            type="submit"
            className="border border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            DELETE
          </button>
        </form>
      </div>
    </div>
  );
}
