import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; journeyId: string } };

// Live tracking feed for one journey: the recent GPS trail (driver phone / device),
// the current position, and the route's geocoded stops — everything the control
// centre needs to draw a live map. No third-party provider required.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);

    const journey = await prisma.journey.findFirst({
      where: { id: params.journeyId, schoolId: params.id },
      include: {
        route: { select: { name: true, stops: { orderBy: { sequence: "asc" }, select: { name: true, kind: true, lat: true, lng: true, plannedArrival: true, sequence: true } } } },
        vehicle: { select: { reference: true, label: true } },
        positions: { orderBy: { at: "desc" }, take: 60 },
      },
    });
    if (!journey) return ok({ error: "Not found" }, 404);

    const trail = [...journey.positions].reverse().map((p) => ({ lat: p.lat, lng: p.lng, at: p.at }));
    const last = trail.length ? trail[trail.length - 1] : null;
    return ok({
      journey: {
        id: journey.id, routeName: journey.route.name, session: journey.session,
        status: journey.status, delayMinutes: journey.delayMinutes,
        vehicle: journey.vehicle ? (journey.vehicle.label || journey.vehicle.reference) : null,
      },
      stops: journey.route.stops.filter((s) => s.lat != null && s.lng != null),
      trail, last,
      sharing: journey.status === "started" || journey.status === "approaching",
    });
  } catch (err) { return handleError(err); }
}
