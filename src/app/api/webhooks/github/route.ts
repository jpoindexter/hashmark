import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { getGitHubToken } from "@/lib/github";
import { runScan } from "@/lib/scan-worker";

interface GitHubPushPayload {
  ref: string;
  after: string;
  repository: {
    id: number;
    full_name: string;
    default_branch: string;
  };
  sender: {
    login: string;
  };
  head_commit: {
    id: string;
    message: string;
    author: { name: string; email: string };
  } | null;
}

function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const event = request.headers.get("x-github-event");
  const signature = request.headers.get("x-hub-signature-256");
  const body = await request.text();

  // Only process push events
  if (event !== "push") {
    return NextResponse.json(
      { received: true, action: "ignored", reason: `Event type '${event}' not handled` },
      { status: 200 }
    );
  }

  // Verify webhook signature
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error("GITHUB_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  if (!verifySignature(body, signature, secret)) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  const payload: GitHubPushPayload = JSON.parse(body);

  // Only process pushes to the default branch
  const expectedRef = `refs/heads/${payload.repository.default_branch}`;
  if (payload.ref !== expectedRef) {
    return NextResponse.json(
      { received: true, action: "ignored", reason: "Push to non-default branch" },
      { status: 200 }
    );
  }

  // Ignore pushes from hashmark[bot] to prevent infinite loops
  if (payload.sender.login === "hashmark[bot]") {
    return NextResponse.json(
      { received: true, action: "ignored", reason: "Push from hashmark bot" },
      { status: 200 }
    );
  }

  // Ignore commits that are context file updates (double protection)
  if (payload.head_commit?.message.includes("[hashmark]")) {
    return NextResponse.json(
      { received: true, action: "ignored", reason: "Hashmark commit" },
      { status: 200 }
    );
  }

  // Look up the repo in our database by GitHub repo ID
  const repo = await db.repository.findUnique({
    where: { githubRepoId: payload.repository.id },
    select: { id: true, userId: true, fullName: true },
  });

  if (!repo) {
    return NextResponse.json(
      { received: true, action: "ignored", reason: "Repository not connected" },
      { status: 200 }
    );
  }

  // Verify the user is on a plan that supports auto-sync
  const user = await db.user.findUnique({
    where: { id: repo.userId },
    select: { plan: true },
  });

  if (user?.plan === "FREE") {
    return NextResponse.json(
      { received: true, action: "ignored", reason: "Free plan — auto-sync requires Pro" },
      { status: 200 }
    );
  }

  // Check for an already-running scan to avoid duplicates
  const activeScan = await db.scan.findFirst({
    where: {
      repositoryId: repo.id,
      status: { in: ["PENDING", "SCANNING"] },
    },
  });

  if (activeScan) {
    return NextResponse.json(
      { received: true, action: "ignored", reason: "Scan already in progress" },
      { status: 200 }
    );
  }

  // Create a pending scan and kick off background worker
  const scan = await db.scan.create({
    data: {
      repositoryId: repo.id,
      status: "PENDING",
      commitSha: payload.after,
    },
  });

  try {
    const token = await getGitHubToken(repo.userId);
    runScan(scan.id, repo.fullName, token).catch(console.error);
  } catch (error) {
    // If we can't get the token, fail the scan gracefully
    await db.scan.update({
      where: { id: scan.id },
      data: {
        status: "FAILED",
        error:
          error instanceof Error
            ? error.message
            : "Failed to retrieve GitHub token",
      },
    });
  }

  return NextResponse.json(
    { received: true, action: "scan_triggered" },
    { status: 200 }
  );
}
