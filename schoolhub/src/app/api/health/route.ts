import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Liveness/readiness probe for monitoring & load balancers. Checks DB connectivity.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
