import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
