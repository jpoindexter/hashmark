import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events (SSE) endpoint for real-time scan progress.
 * Provides a "Live Terminal" experience on the dashboard.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { repoId } = await params;

  // Set up SSE headers
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Poll the database for progress updates
      // Note: In a larger scale app, use Redis Pub/Sub here.
      const interval = setInterval(async () => {
        const scan = await db.scan.findFirst({
          where: { repositoryId: repoId },
          orderBy: { createdAt: "desc" },
          select: { status: true, results: true },
        });

        if (!scan) return;

        const results = scan.results as Record<string, unknown>;
        const progress = results?.progress;

        sendEvent({
          status: scan.status,
          progress,
        });

        if (scan.status === "COMPLETED" || scan.status === "FAILED") {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
