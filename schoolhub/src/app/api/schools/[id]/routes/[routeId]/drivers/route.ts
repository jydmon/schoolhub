import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { routeDriversSchema } from "@/lib/validation";
import { listRouteDrivers, setRouteDrivers } from "@/lib/transport";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; routeId: string } };

// The transport manager (or tenant admin) assigns one or more drivers to a route.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    return ok({ drivers: await listRouteDrivers(params.routeId) });
  } catch (err) { return handleError(err); }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const { drivers } = routeDriversSchema.parse(await req.json());
    const res = await setRouteDrivers({ schoolId: params.id, routeId: params.routeId, drivers, actorUserId: ctx.userId, actorEmail: ctx.email });
    return ok(res);
  } catch (err) { return handleError(err); }
}
