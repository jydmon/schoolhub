import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { eventUpdateSchema } from "@/lib/validation";
import { postEventUpdate, tripTimeline, getTripUpdateButtons } from "@/lib/event-updates";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };
// GET ?tripId=  -> timeline + buttons ; POST -> post a real-time update
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    const tripId = new URL(req.url).searchParams.get("tripId");
    if (!tripId) throw new AppError("tripId required", 400);
    return ok({ ...(await tripTimeline(tripId)), buttons: await getTripUpdateButtons(tripId) });
  } catch (err) { return handleError(err); }
}
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const body = eventUpdateSchema.parse(await req.json());
    return ok(await postEventUpdate({ ...body, schoolId: params.id, byUserId: ctx.userId }), 201);
  } catch (err) { return handleError(err); }
}
