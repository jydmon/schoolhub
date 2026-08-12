import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { handleError, ok } from "@/lib/http";

// Parent-facing live tracking for their own child's bus. Privacy-scoped:
//  - only journeys a linked child is actually assigned to,
//  - only the child's OWN stop is returned (never other families' stops),
//  - nothing once the journey has completed/cancelled.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const sp = new URL(req.url).searchParams;
    const journeyId = sp.get("journeyId") || "";
    const studentId = sp.get("studentId") || "";
    if (!journeyId || !studentId) return ok({ error: "journeyId and studentId are required" }, 400);

    // The parent must be linked to this child.
    const link = await prisma.guardianLink.findFirst({
      where: { parentUserId: ctx.userId, studentId },
      include: { student: { include: { transportProfile: true } } },
    });
    if (!link) return ok({ error: "Not found" }, 404);
    const profile = link.student.transportProfile;

    const journey = await prisma.journey.findFirst({
      where: { id: journeyId },
      include: { route: { include: { stops: true } }, positions: { orderBy: { at: "desc" }, take: 60 } },
    });
    // The child must be assigned to this journey's route.
    if (!journey || !profile?.routeId || profile.routeId !== journey.routeId) return ok({ error: "Not found" }, 404);
    if (journey.status === "completed" || journey.status === "cancelled") {
      return ok({ journey: { id: journey.id, status: journey.status }, trail: [], last: null, myStop: null, sharing: false, ended: true });
    }

    const stopId = journey.session === "am" ? profile.morningStopId : profile.afternoonStopId;
    const myStop = journey.route.stops.find((s) => s.id === stopId && s.lat != null && s.lng != null);
    const trail = [...journey.positions].reverse().map((p) => ({ lat: p.lat, lng: p.lng, at: p.at }));

    return ok({
      journey: { id: journey.id, session: journey.session, status: journey.status, delayMinutes: journey.delayMinutes },
      trail,
      last: trail.length ? trail[trail.length - 1] : null,
      myStop: myStop ? { name: myStop.name, lat: myStop.lat, lng: myStop.lng, plannedArrival: myStop.plannedArrival } : null,
      sharing: journey.status === "started" || journey.status === "approaching",
    });
  } catch (err) { return handleError(err); }
}
