"use client";

import { useState } from "react";
import { createRule } from "@/app/(dashboard)/dashboard/settings/actions";

export function RuleDialog({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      await createRule(fd);
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider">
            ADD CUSTOM RULE
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close dialog"
          >
            X
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
              [NAME]
            </label>
            <input
              name="name"
              required
              autoFocus
              placeholder="e.g., Use TypeScript strict mode"
              className="w-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
              [DESCRIPTION] (OPTIONAL)
            </label>
            <input
              name="description"
              placeholder="Brief description of the rule"
              className="w-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
              [RULE CONTENT]
            </label>
            <textarea
              name="rule"
              required
              rows={6}
              placeholder="Write the rule that will be injected into generated context files..."
              className="w-full resize-none border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
              [SCOPE]
            </label>
            <select
              name="scope"
              defaultValue="REPO"
              className="w-full border border-border bg-background px-4 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
            >
              <option value="REPO">REPO</option>
              <option value="ORG">ORG</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-border px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="border border-accent bg-accent/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {submitting ? "SAVING..." : "> CREATE RULE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
