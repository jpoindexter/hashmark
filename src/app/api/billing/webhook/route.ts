import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object;
      const customerId = checkoutSession.customer as string;

      // Look up user by Stripe customer ID and upgrade plan
      const user = await db.user.findUnique({
        where: { stripeCustomerId: customerId },
      });

      if (user) {
        // Determine plan from the price
        const lineItems = await stripe.checkout.sessions.listLineItems(
          checkoutSession.id
        );
        const priceId = lineItems.data[0]?.price?.id;

        let plan: "FREE" | "PRO" | "TEAM" = "PRO";
        if (priceId === process.env.STRIPE_TEAM_PRICE_ID) {
          plan = "TEAM";
        }

        await db.user.update({
          where: { id: user.id },
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
  }

  return NextResponse.json({ received: true });
}
