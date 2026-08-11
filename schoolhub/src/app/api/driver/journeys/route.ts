import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { todayStr } from "@/lib/transport";
import { handleError, ok } from "@/lib/http";

// A driver's assigned journeys (default: today).
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const date = new URL(req.url).searchParams.get("date") || todayStr();
    const journeys = await prisma.journey.findMany({
      where: { driverUserId: ctx.userId, date },
      include: { route: { select: { name: true } }, vehicle: { select: { reference: true, label: true } }, boardings: { select: { status: true } } },
      orderBy: { session: "asc" },
    });
    return ok({
      date,
      journeys: journeys.map((j) => ({
        id: j.id, routeName: j.route.name, session: j.session, status: j.status,
        vehicle: j.vehicle ? (j.vehicle.label || j.vehicle.reference) : null,
        onboard: j.boardings.filter((b) => b.status === "boarded").length,
      })),
    });
  } catch (err) { return handleError(err); }
}
