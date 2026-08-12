import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; vehicleId: string } };
const FIELDS = ["reference", "label", "capacity", "type", "gpsSource", "active", "motDue", "insuranceDue", "serviceDue", "taxDue", "notes"];

// Update a vehicle — including fleet compliance reminders (MOT / insurance /
// service / tax) and active status.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const veh = await prisma.vehicle.findFirst({ where: { id: params.vehicleId, schoolId: params.id } });
    if (!veh) return ok({ error: "Vehicle not found" }, 404);
    const b = await req.json().catch(() => ({}));
    const data: any = {};
    for (const k of FIELDS) if (k in b) data[k] = k === "capacity" ? Number(b[k]) : (b[k] === "" ? null : b[k]);
    const updated = await prisma.vehicle.update({ where: { id: veh.id }, data });
    return ok({ vehicle: updated });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const veh = await prisma.vehicle.findFirst({ where: { id: params.vehicleId, schoolId: params.id } });
    if (!veh) return ok({ error: "Vehicle not found" }, 404);
    await prisma.vehicle.update({ where: { id: veh.id }, data: { active: false } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
