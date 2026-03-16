import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// In-memory dedup cache for webhook event IDs.
// Prevents double-processing when Polar retries on transient errors.
// Max 500 entries — old entries evicted when full to bound memory usage.
const MAX_SEEN = 500;
const seenEventIds = new Set<string>();

function markSeen(id: string): boolean {
  if (seenEventIds.has(id)) return true;
  if (seenEventIds.size >= MAX_SEEN) {
    const first = seenEventIds.values().next().value;
    if (first) seenEventIds.delete(first);
  }
  seenEventIds.add(id);
  return false;
}

export async function POST(request: Request) {
  const body = await request.arrayBuffer();

  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("POLAR_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event;
  try {
    event = validateEvent(
      Buffer.from(body),
      Object.fromEntries(request.headers),
      webhookSecret
    );
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
    throw err;
  }

  // Deduplicate: Polar retries on non-2xx — avoid double plan updates
  const eventId = (event as { id?: string }).id;
  if (eventId && markSeen(eventId)) {
    return NextResponse.json({ received: true, action: "duplicate" }, { status: 202 });
  }

  switch (event.type) {
    case "subscription.active": {
      // New subscription or payment recovered — grant paid plan
      const userId = event.data.customer.externalId;
      if (userId) {
        const plan = resolvePlan(event.data.productId);
        await db.user.update({ where: { id: userId }, data: { plan } });
      }
      break;
    }

    case "subscription.updated": {
      // Plan changed mid-cycle (upgrade or downgrade)
      const userId = event.data.customer.externalId;
      if (userId) {
        const plan = resolvePlan(event.data.productId);
        await db.user.update({ where: { id: userId }, data: { plan } });
      }
      break;
    }

    case "subscription.revoked": {
      // Subscription ended immediately — downgrade to FREE
      const userId = event.data.customer.externalId;
      if (userId) {
        await db.user.update({ where: { id: userId }, data: { plan: "FREE" } });
      }
      break;
    }

    // subscription.canceled: scheduled to end at period close — no immediate action
    // subscription.uncanceled: reversal of cancel — no action needed (still active)
  }

  return NextResponse.json({ received: true }, { status: 202 });
}

/** Map a Polar product ID to a Hashmark plan. */
function resolvePlan(productId: string): "FREE" | "PRO" | "TEAM" {
  if (productId === process.env.POLAR_TEAM_PRODUCT_ID) return "TEAM";
  if (productId === process.env.POLAR_PRO_PRODUCT_ID) return "PRO";
  // Unknown product — safe default, don't grant paid plan
  return "FREE";
}
