import { NextResponse } from "next/server";

/**
 * GitHub webhook handler for push events.
 * When a push occurs on a connected repo, trigger an auto-scan.
 * TODO: Implement signature verification + scan trigger.
 */
export async function POST(request: Request) {
  const event = request.headers.get("x-github-event");

  if (event !== "push") {
    return NextResponse.json({ message: "Event ignored" }, { status: 200 });
  }

  // TODO: Verify webhook signature
  // TODO: Look up repo by github_repo_id
  // TODO: Create scan and kick off background worker

  return NextResponse.json({ message: "Webhook received" }, { status: 200 });
}
