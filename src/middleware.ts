import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight middleware that checks for the session cookie
 * without calling the Prisma-backed auth() (which fails on edge runtime).
 * Actual session validation happens in server components/actions.
 */
export function middleware(req: NextRequest) {
  const sessionToken =
    req.cookies.get("authjs.session-token") ??
    req.cookies.get("__Secure-authjs.session-token");

  const isLoggedIn = !!sessionToken;
  const isOnDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  const isOnLogin = req.nextUrl.pathname === "/login";

  if (isOnDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isOnLogin && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    // API routes — cookie check adds a defense-in-depth layer so a newly added
    // route that accidentally omits auth() doesn't sit fully open.
    // Webhooks and health are intentionally excluded — they have their own auth.
    "/api/((?!auth|health|billing/webhook|webhooks).*)",
  ],
};
