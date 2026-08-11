import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { eventConfigSchema } from "@/lib/validation";
import { setTripUpdateConfig } from "@/lib/event-updates";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const { tripId, removed, custom } = eventConfigSchema.parse(await req.json());
    await setTripUpdateConfig(tripId, { removed, custom }, { userId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
