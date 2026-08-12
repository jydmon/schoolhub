import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { routeUpdateSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; routeId: string } };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const existing = await prisma.route.findFirst({ where: { id: params.routeId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    const input = routeUpdateSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if ((input as any).type !== undefined) data.type = (input as any).type;
    if (input.vehicleId !== undefined) data.vehicleId = input.vehicleId || null;
    if (input.driverUserId !== undefined) data.driverUserId = input.driverUserId || null;
    if (input.cutoffTime !== undefined) data.cutoffTime = input.cutoffTime;
    if (input.termlyFee !== undefined) data.termlyFee = input.termlyFee;
    if (input.active !== undefined) data.active = input.active;
    const route = await prisma.route.update({ where: { id: existing.id }, data });
    return ok({ route });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const existing = await prisma.route.findFirst({ where: { id: params.routeId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    await prisma.route.delete({ where: { id: existing.id } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
