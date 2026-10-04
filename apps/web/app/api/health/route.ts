import { NextResponse } from "next/server";
import { prisma } from "@cod/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness for the load balancer: 200 only when the database answers. Reveals nothing
 * about the deployment (no versions, hosts or error text) because it is public.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
