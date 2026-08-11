import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { tripSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; tripId: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const trip = await prisma.trip.findFirst({
      where: { id: params.tripId, schoolId: params.id },
      include: {
        students: { include: { student: { select: { firstName: true, lastName: true, reference: true, medicalAlert: true } } } },
        staff: { include: { user: { select: { fullName: true, email: true } } } },
        updates: { orderBy: { at: "desc" } },
        days: { orderBy: { sequence: "asc" } },
        headcounts: { orderBy: { at: "desc" }, take: 20 },
        photos: { orderBy: { at: "desc" } },
      },
    });
    if (!trip) return ok({ error: "Not found" }, 404);
    return ok({ trip });
  } catch (err) { return handleError(err); }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const existing = await prisma.trip.findFirst({ where: { id: params.tripId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    const i = tripSchema.partial().parse(await req.json());
    const trip = await prisma.trip.update({ where: { id: existing.id }, data: i as any });
    await recordAudit({ action: AUDIT.TRIP_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Trip", targetId: trip.id, metadata: { op: "update" } });
    return ok({ trip });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const existing = await prisma.trip.findFirst({ where: { id: params.tripId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    await prisma.trip.delete({ where: { id: existing.id } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
