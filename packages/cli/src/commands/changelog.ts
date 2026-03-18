import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface ChangelogOptions {
  from?: string;
  to?: string;
  output?: string;
  format?: "md" | "json";
  noScope?: boolean;
  update?: boolean;
}

interface CommitEntry {
  hash: string;
  subject: string;
  author: string;
  date: string;
  type: string;
  scope: string | null;
  description: string;
  breaking: boolean;
}

interface GroupedCommits {
  [type: string]: CommitEntry[];
}

const TYPE_LABELS: Record<string, string> = {
  feat: "✨ Features",
  fix: "🐛 Bug Fixes",
  perf: "⚡ Performance",
  refactor: "♻️ Refactoring",
  docs: "📚 Documentation",
  test: "🧪 Tests",
  style: "🎨 Style",
  chore: "🔧 Chores",
  ci: "🔧 CI",
  build: "🔧 Build",
  revert: "⏪ Reverts",
  other: "📦 Other",
};

const TYPE_ORDER = [
  "feat", "fix", "perf", "refactor", "docs", "test", "style",
  "chore", "ci", "build", "revert", "other",
];

function getLastTag(projectDir: string): string | null {
  try {
    const tag = execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
      cwd: projectDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return tag || null;
  } catch {
    return null;
  }
}

function getFirstCommit(projectDir: string): string {
  return execFileSync("git", ["rev-list", "--max-parents=0", "HEAD"], {
    cwd: projectDir,
    encoding: "utf-8",
  }).trim();
}

function parseConventionalCommit(subject: string): {
  type: string;
  scope: string | null;
  description: string;
  breaking: boolean;
} {
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?\s*:\s*(.+)$/);
  if (!match) {
    return { type: "other", scope: null, description: subject, breaking: false };
  }
  return {
    type: match[1].toLowerCase(),
    scope: match[2] ?? null,
    description: match[4],
    breaking: match[3] === "!",
  };
}

function fetchCommits(projectDir: string, from: string, to: string): CommitEntry[] {
  const range = `${from}..${to}`;
  const raw = execFileSync(
    "git",
    ["log", "--format=%H|%s|%an|%ai", "--no-merges", range],
    { cwd: projectDir, encoding: "utf-8" }
  ).trim();

  if (!raw) return [];

  return raw.split("\n").map((line) => {
    const parts = line.split("|");
    const hash = parts[0] ?? "";
    const subject = parts[1] ?? "";
    const author = parts[2] ?? "";
    const date = parts.slice(3).join("|"); // date may contain pipes
    const parsed = parseConventionalCommit(subject.trim());
    return {
      hash: hash.trim(),
      subject: subject.trim(),
      author: author.trim(),
      date: date.trim(),
      ...parsed,
    };
  });
}

function groupByType(commits: CommitEntry[]): GroupedCommits {
  const groups: GroupedCommits = {};
  for (const commit of commits) {
    const type = TYPE_LABELS[commit.type] ? commit.type : "other";
    if (!groups[type]) groups[type] = [];
    groups[type].push(commit);
  }
  return groups;
}

function formatCommitLine(commit: CommitEntry, noScope: boolean): string {
  const scopePart = !noScope && commit.scope ? `**${commit.scope}**: ` : "";
  const breaking = commit.breaking ? " BREAKING" : "";
  const shortHash = commit.hash.slice(0, 7);
  return `- ${scopePart}${commit.description} (\`${shortHash}\`)${breaking}`;
}

function renderMarkdown(
  commits: CommitEntry[],
  from: string,
  to: string,
  noScope: boolean
): string {
  const grouped = groupByType(commits);
  const label = to === "HEAD" ? "Unreleased" : to;
  const sinceLabel = from ? `since ${from}` : "all commits";

  const lines: string[] = [
    "# Changelog",
    "",
    `## [${label}] — ${sinceLabel}`,
    "",
  ];

  let hasContent = false;

  for (const type of TYPE_ORDER) {
    if (!grouped[type] || grouped[type].length === 0) continue;
    hasContent = true;
    lines.push(`### ${TYPE_LABELS[type]}`);
    for (const commit of grouped[type]) {
      lines.push(formatCommitLine(commit, noScope));
    }
    lines.push("");
  }

  if (!hasContent) {
    lines.push("_No changes found._", "");
  }

  return lines.join("\n");
}

function renderJson(
  commits: CommitEntry[],
  from: string,
  to: string
): string {
  const grouped = groupByType(commits);
  const payload = {
    version: to === "HEAD" ? "unreleased" : to,
    since: from,
    generatedAt: new Date().toISOString(),
    groups: Object.fromEntries(
      TYPE_ORDER
        .filter((t) => grouped[t]?.length)
        .map((t) => [
          t,
          (grouped[t] ?? []).map((c) => ({
            hash: c.hash,
            scope: c.scope,
            description: c.description,
            author: c.author,
            date: c.date,
            breaking: c.breaking,
          })),
        ])
    ),
  };
  return JSON.stringify(payload, null, 2);
}

export async function runChangelog(projectDir: string, opts: ChangelogOptions): Promise<void> {
  const to = opts.to ?? "HEAD";
  let from = opts.from;

  if (!from) {
    const lastTag = getLastTag(projectDir);
    from = lastTag ?? getFirstCommit(projectDir);
  }

  const commits = fetchCommits(projectDir, from, to);
  const format = opts.format ?? "md";
  const noScope = opts.noScope ?? false;

  let output: string;
  if (format === "json") {
    output = renderJson(commits, from, to);
  } else {
    output = renderMarkdown(commits, from, to, noScope);
  }

  if (opts.update && format === "md") {
    const changelogPath = opts.output ?? join(projectDir, "CHANGELOG.md");
    if (existsSync(changelogPath)) {
      const existing = readFileSync(changelogPath, "utf-8");
      const existingBody = existing.replace(/^# Changelog\n+/, "");
      const newBody = output.replace(/^# Changelog\n+/, "");
      output = `# Changelog\n\n${newBody}\n---\n\n${existingBody}`;
    }
    writeFileSync(changelogPath, output, "utf-8");
    console.log(`Changelog updated: ${changelogPath}`);
    return;
  }

  if (opts.output) {
    writeFileSync(opts.output, output, "utf-8");
    console.log(`Changelog written to ${opts.output}`);
  } else {
    process.stdout.write(output + "\n");
  }
}
