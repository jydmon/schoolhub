import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { routeSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const routes = await prisma.route.findMany({
      where: { schoolId: params.id },
      include: { stops: { orderBy: { sequence: "asc" } }, vehicle: true, _count: { select: { profiles: true } } },
      orderBy: { name: "asc" },
    });
    return ok({ routes });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const input = routeSchema.parse(await req.json());
    const route = await prisma.route.create({
      data: {
        schoolId: params.id, name: input.name, type: input.type || "fixed",
        vehicleId: input.vehicleId || null, driverUserId: input.driverUserId || null, cutoffTime: input.cutoffTime || "07:00",
        stops: input.stops?.length ? { create: input.stops.map((s, i) => ({ name: s.name, kind: s.kind || "pickup", address: s.address || null, lat: s.lat ?? null, lng: s.lng ?? null, plannedArrival: s.plannedArrival || null, sequence: i })) } : undefined,
      },
      include: { stops: true },
    });
    await recordAudit({ action: AUDIT.TRANSPORT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Route", targetId: route.id, metadata: { op: "create" } });
    return ok({ route }, 201);
  } catch (err) { return handleError(err); }
}
