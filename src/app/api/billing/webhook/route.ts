import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object;
      const customerId = checkoutSession.customer as string;

      const user = await db.user.findUnique({
        where: { stripeCustomerId: customerId },
      });

      if (user) {
        const lineItems = await stripe.checkout.sessions.listLineItems(
          checkoutSession.id
        );
        const priceId = lineItems.data[0]?.price?.id;

        const plan = resolvePlan(priceId);

        await db.user.update({
          where: { id: user.id },
          data: { plan },
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const customerId = subscription.customer as string;

      // Subscription changed (upgrade/downgrade mid-cycle)
      if (subscription.status === "active") {
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = resolvePlan(priceId);

        await db.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const customerId = subscription.customer as string;

      await db.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: { plan: "FREE" },
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = invoice.customer as string;

      // Payment failed — if this is the final attempt, downgrade to FREE
      // Stripe sends this on every retry; check attempt_count to act on final failure
      if (invoice.attempt_count >= 3) {
        await db.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan: "FREE" },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

/** Map a Stripe price ID to a Hashmark plan. */
function resolvePlan(priceId: string | undefined): "FREE" | "PRO" | "TEAM" {
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return "TEAM";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO";
  // Unknown price ID — safe default, don't grant paid plan
  return "FREE";
}
