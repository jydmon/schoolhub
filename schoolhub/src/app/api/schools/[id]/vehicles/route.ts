import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { vehicleSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const vehicles = await prisma.vehicle.findMany({ where: { schoolId: params.id }, orderBy: { reference: "asc" } });
    return ok({ vehicles });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const input = vehicleSchema.parse(await req.json());
    const dup = await prisma.vehicle.findUnique({ where: { schoolId_reference: { schoolId: params.id, reference: input.reference } } });
    if (dup) return ok({ error: "Vehicle reference already exists" }, 409);
    const vehicle = await prisma.vehicle.create({
      data: { schoolId: params.id, reference: input.reference, label: input.label || null, capacity: input.capacity ?? 16, type: input.type || "minibus", gpsSource: input.gpsSource || "driver_phone" },
    });
    return ok({ vehicle }, 201);
  } catch (err) { return handleError(err); }
}
