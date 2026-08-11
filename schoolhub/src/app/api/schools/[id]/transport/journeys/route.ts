import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { todayStr } from "@/lib/transport";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// School transport control centre: journeys for a day + latest position + incidents.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const date = new URL(req.url).searchParams.get("date") || todayStr();

    const journeys = await prisma.journey.findMany({
      where: { schoolId: params.id, date },
      include: {
        route: { select: { name: true } }, vehicle: { select: { reference: true, label: true } },
        boardings: { select: { status: true } },
        positions: { orderBy: { at: "desc" }, take: 1 },
      },
      orderBy: { session: "asc" },
    });
    const incidents = await prisma.incident.findMany({ where: { schoolId: params.id }, orderBy: { at: "desc" }, take: 20 });

    return ok({
      date,
      journeys: journeys.map((j) => ({
        id: j.id, routeName: j.route.name, session: j.session, status: j.status, delayMinutes: j.delayMinutes,
        vehicle: j.vehicle ? (j.vehicle.label || j.vehicle.reference) : null,
        onboard: j.boardings.filter((b) => b.status === "boarded").length,
        droppedOff: j.boardings.filter((b) => b.status === "dropped_off").length,
        absent: j.boardings.filter((b) => b.status === "absent" || b.status === "not_present").length,
        lastPosition: j.positions[0] ? { lat: j.positions[0].lat, lng: j.positions[0].lng, at: j.positions[0].at } : null,
      })),
      incidents,
    });
  } catch (err) { return handleError(err); }
}
