import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { polar } from "@/lib/polar";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the user exists and has a paid plan before opening the portal
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });

  if (!user || user.plan === "FREE") {
    return NextResponse.json(
      { error: "No active subscription found" },
      { status: 400 }
    );
  }

  // Polar identifies the customer by the externalCustomerId we set at checkout (userId)
  const portalSession = await polar.customerSessions.create({
    externalCustomerId: session.user.id,
    returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  });

  return NextResponse.json({ url: portalSession.customerPortalUrl });
}
