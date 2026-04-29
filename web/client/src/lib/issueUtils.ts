// Issue templates and activity feed utilities

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IssueTemplate {
  id: string;
  name: string;
  description: string;
  defaultTitle: string;
  defaultBody: string;
  defaultPriority: string;
  defaultStatus: string;
  defaultAssignee?: string;
  tags?: string[];
  subtasks?: string[];
  icon: string;
  category: string;
}

export interface ActivityEvent {
  id: string;
  issueId: string;
  issueTitle: string;
  action: "created" | "moved" | "commented" | "deleted" | "assigned";
  detail: string;
  ts: number;
  author?: string;
}

// ── Storage keys ───────────────────────────────────────────────────────────────

const TEMPLATES_KEY = "hm-issue-templates";
const ACTIVITY_KEY = "hm-issue-activity";
const MAX_ACTIVITY = 200;

// ── Built-in templates ─────────────────────────────────────────────────────────

export const BUILTIN_TEMPLATE_IDS = [
  "builtin-bug",
  "builtin-feature",
  "builtin-task",
  "builtin-research",
  "builtin-docs",
  "builtin-release",
];

const BUILTIN_TEMPLATES: IssueTemplate[] = [
  {
    id: "builtin-bug",
    name: "Bug Report",
    description: "Report a problem with steps to reproduce",
    defaultTitle: "Bug: ",
    defaultBody: "## Steps to reproduce\n1. \n\n## Expected\n\n## Actual\n\n## Additional context\n",
    defaultPriority: "high",
    defaultStatus: "backlog",
    icon: "🐛",
    category: "Engineering",
  },
  {
    id: "builtin-feature",
    name: "Feature Request",
    description: "Propose a new feature or enhancement",
    defaultTitle: "Feature: ",
    defaultBody: "## Problem\n\n## Proposed solution\n\n## Acceptance criteria\n- [ ] \n",
    defaultPriority: "medium",
    defaultStatus: "backlog",
    icon: "✨",
    category: "Product",
  },
  {
    id: "builtin-task",
    name: "Task",
    description: "A simple task with a checklist",
    defaultTitle: "",
    defaultBody: "## What needs to be done\n\n## Checklist\n- [ ] \n- [ ] \n",
    defaultPriority: "medium",
    defaultStatus: "todo",
    icon: "📋",
    category: "General",
  },
  {
    id: "builtin-research",
    name: "Research",
    description: "Investigate a question and record findings",
    defaultTitle: "Research: ",
    defaultBody: "## Question\n\n## Sources\n- \n\n## Findings\n\n## Conclusion\n",
    defaultPriority: "low",
    defaultStatus: "todo",
    icon: "🔍",
    category: "Engineering",
  },
  {
    id: "builtin-docs",
    name: "Documentation",
    description: "Write or update documentation",
    defaultTitle: "Docs: ",
    defaultBody: "## Overview\n\n## Sections\n1. \n\n## Related docs\n- \n",
    defaultPriority: "low",
    defaultStatus: "todo",
    icon: "📝",
    category: "Docs",
  },
  {
    id: "builtin-release",
    name: "Release",
    description: "Track a release with changelog and deployment steps",
    defaultTitle: "Release v",
    defaultBody: "## Changes\n- \n\n## Testing\n- [ ] \n\n## Deployment steps\n1. \n\n## Rollback plan\n",
    defaultPriority: "high",
    defaultStatus: "todo",
    icon: "🚀",
    category: "Operations",
  },
];

// ── Template helpers ───────────────────────────────────────────────────────────

export function loadTemplates(): IssueTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) {
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(BUILTIN_TEMPLATES));
      return BUILTIN_TEMPLATES;
    }
    const parsed = JSON.parse(raw) as IssueTemplate[];
    // Ensure all builtins are present (seed missing ones)
    const ids = new Set(parsed.map(t => t.id));
    const missing = BUILTIN_TEMPLATES.filter(t => !ids.has(t.id));
    if (missing.length > 0) {
      const merged = [...missing, ...parsed];
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(merged));
      return merged;
    }
    return parsed;
  } catch {
    return BUILTIN_TEMPLATES;
  }
}

export function saveTemplates(templates: IssueTemplate[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export function deleteTemplate(id: string): IssueTemplate[] {
  const templates = loadTemplates().filter(t => t.id !== id);
  saveTemplates(templates);
  return templates;
}

export function upsertTemplate(template: IssueTemplate): IssueTemplate[] {
  const existing = loadTemplates();
  const idx = existing.findIndex(t => t.id === template.id);
  let next: IssueTemplate[];
  if (idx >= 0) {
    next = existing.map((t, i) => i === idx ? template : t);
  } else {
    next = [template, ...existing];
  }
  saveTemplates(next);
  return next;
}

// ── Activity helpers ───────────────────────────────────────────────────────────

export function loadActivity(): ActivityEvent[] {
  try {
    return JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? "[]") as ActivityEvent[];
  } catch {
    return [];
  }
}

export function recordActivity(event: Omit<ActivityEvent, "id" | "ts">): void {
  const events = loadActivity();
  const next = [{ ...event, id: crypto.randomUUID(), ts: Date.now() }, ...events];
  if (next.length > MAX_ACTIVITY) next.splice(MAX_ACTIVITY);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
}

export function exportActivityCsv(events: ActivityEvent[]): void {
  const header = "id,issueId,issueTitle,action,detail,ts,author";
  const rows = events.map(e =>
    [e.id, e.issueId, `"${e.issueTitle.replace(/"/g, '""')}"`, e.action, `"${e.detail.replace(/"/g, '""')}"`, e.ts, e.author ?? ""].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `issue-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
