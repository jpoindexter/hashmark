import { auth } from "@/lib/auth";
import { polar } from "@/lib/polar";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId } = await request.json();

  // Allowlist: only accept known product IDs to prevent arbitrary plan grants
  const ALLOWED_PRODUCTS = new Set([
    process.env.POLAR_PRO_PRODUCT_ID,
    process.env.POLAR_TEAM_PRODUCT_ID,
  ]);
  if (!productId || !ALLOWED_PRODUCTS.has(productId)) {
    return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
  }

  const checkout = await polar.checkouts.create({
    products: [productId],
    externalCustomerId: session.user.id,
    successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=true`,
    returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  });

  return NextResponse.json({ url: checkout.url }, { status: 201 });
}
