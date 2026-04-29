import { createHmac, timingSafeEqual } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface GitHubConfig {
  webhookSecret?: string;
  autoWorkflowId?: string;   // workflow to trigger on issues.opened
  prWorkflowId?: string;     // workflow to trigger on pull_request.opened
  enabled: boolean;
}

export function loadGitHubConfig(dataDir: string): GitHubConfig {
  const path = join(dataDir, "github.json");
  if (!existsSync(path)) return { enabled: false };
  try { return JSON.parse(readFileSync(path, "utf-8")) as GitHubConfig; } catch { return { enabled: false }; }
}

export function saveGitHubConfig(dataDir: string, cfg: GitHubConfig): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "github.json"), JSON.stringify(cfg, null, 2), "utf-8");
}

export function verifyGitHubSignature(secret: string, body: string, sig: string): boolean {
  if (!sig.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function parseWebhookEvent(event: string, payload: Record<string, unknown>): {
  type: "issue_opened" | "pr_opened" | "unknown";
  title: string;
  body: string;
  number: number;
  url: string;
} | null {
  if (event === "issues" && payload.action === "opened") {
    const issue = payload.issue as Record<string, unknown>;
    return {
      type: "issue_opened",
      title: String(issue.title ?? ""),
      body: String(issue.body ?? ""),
      number: Number(issue.number ?? 0),
      url: String(issue.html_url ?? ""),
    };
  }
  if (event === "pull_request" && payload.action === "opened") {
    const pr = payload.pull_request as Record<string, unknown>;
    return {
      type: "pr_opened",
      title: String(pr.title ?? ""),
      body: String(pr.body ?? ""),
      number: Number(pr.number ?? 0),
      url: String(pr.html_url ?? ""),
    };
  }
  return null;
}
