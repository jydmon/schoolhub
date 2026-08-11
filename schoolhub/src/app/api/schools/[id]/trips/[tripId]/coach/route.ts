import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { coachAccessSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; tripId: string } };

// Issue a temporary, auto-expiring secure location-sharing link for a hired coach
// driver. Access expires automatically after `hours` (default 6).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const trip = await prisma.trip.findFirst({ where: { id: params.tripId, schoolId: params.id } });
    if (!trip) return ok({ error: "Not found" }, 404);
    const { driverName, hours } = coachAccessSchema.parse(await req.json());
    const token = randomBytes(18).toString("hex");
    const expiresAt = new Date(Date.now() + (hours ?? 6) * 3600 * 1000);
    await prisma.trip.update({ where: { id: trip.id }, data: { coachToken: token, coachExpiresAt: expiresAt, coachDriverName: driverName } });
    const base = process.env.APP_URL || "";
    return ok({ token, driverName, expiresAt, shareUrl: `${base}/api/trips/coach/${token}` });
  } catch (err) { return handleError(err); }
}
