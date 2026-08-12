import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { todayStr } from "@/lib/transport";
import { handleError, ok } from "@/lib/http";

// A driver's past journeys (most recent first).
export async function GET() {
  try {
    const ctx = await requireAuth();
    const journeys = await prisma.journey.findMany({
      where: { driverUserId: ctx.userId, date: { lt: todayStr() } },
      include: { route: { select: { name: true } }, vehicle: { select: { reference: true, label: true } }, boardings: { select: { status: true } } },
      orderBy: [{ date: "desc" }, { session: "asc" }], take: 90,
    });
    return ok({
      journeys: journeys.map((j) => ({
        id: j.id, date: j.date, routeName: j.route.name, session: j.session, status: j.status,
        vehicle: j.vehicle ? (j.vehicle.label || j.vehicle.reference) : null,
        boarded: j.boardings.filter((b) => b.status === "boarded" || b.status === "dropped_off").length,
        absent: j.boardings.filter((b) => b.status === "absent").length,
        delayMinutes: j.delayMinutes, completedAt: j.completedAt,
      })),
    });
  } catch (err) { return handleError(err); }
}
