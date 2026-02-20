"use client";

import { useState } from "react";
import {
  Input,
  Button,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@fabrk/components";
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
        className="absolute inset-0 bg-background/90"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-[var(--grid-4)]">
          <h2 className="type-h3">
            ADD CUSTOM RULE
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close dialog"
          >
            X
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-[var(--grid-4)]">
          <div>
            <label className="mb-[var(--grid-1)] block type-label text-muted-foreground">
              [NAME]
            </label>
            <Input
              name="name"
              required
              autoFocus
              placeholder="e.g., Use TypeScript strict mode"
            />
          </div>

          <div>
            <label className="mb-[var(--grid-1)] block type-label text-muted-foreground">
              [DESCRIPTION] (OPTIONAL)
            </label>
            <Input
              name="description"
              placeholder="Brief description of the rule"
            />
          </div>

          <div>
            <label className="mb-[var(--grid-1)] block type-label text-muted-foreground">
              [RULE CONTENT]
            </label>
            <Textarea
              name="rule"
              required
              rows={6}
              placeholder="Write the rule that will be injected into generated context files..."
              className="resize-none"
            />
          </div>

          <div>
            <label className="mb-[var(--grid-1)] block type-label text-muted-foreground">
              [SCOPE]
            </label>
            <Select name="scope" defaultValue="REPO">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="REPO">REPO</SelectItem>
                <SelectItem value="ORG">ORG</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-[var(--grid-2)] pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              CANCEL
            </Button>
            <Button type="submit" disabled={submitting} loading={submitting} loadingText="SAVING...">
              {"> CREATE RULE"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
