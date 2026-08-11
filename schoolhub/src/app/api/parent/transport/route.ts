import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { todayStr, journeyProgress, etaFor } from "@/lib/transport";
import { handleError, ok } from "@/lib/http";

// Parent live transport view. Privacy: a parent only ever sees the journey their
// own child is on — no other students, no home addresses, and nothing once the
// journey has completed.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const date = new URL(req.url).searchParams.get("date") || todayStr();
    const links = await prisma.guardianLink.findMany({
      where: { parentUserId: ctx.userId },
      include: { student: { include: { transportProfile: true } } },
    });

    const items: any[] = [];
    for (const l of links) {
      const profile = l.student.transportProfile;
      if (!profile?.routeId) continue;
      const journeys = await prisma.journey.findMany({
        where: { routeId: profile.routeId, date },
        include: { route: { include: { stops: { orderBy: { sequence: "asc" } } } }, boardings: true, positions: { orderBy: { at: "desc" }, take: 1 } },
      });
      for (const j of journeys) {
        const mine = j.boardings.find((b) => b.studentId === l.student.id);
        const prog = journeyProgress(j.route.stops, j.boardings);
        const stopId = j.session === "am" ? profile.morningStopId : profile.afternoonStopId;
        const stop = j.route.stops.find((s) => s.id === stopId);
        const eta = etaFor(stop?.plannedArrival, j.delayMinutes, new Date(`${date}T00:00:00`));
        items.push({
          childName: `${l.student.firstName} ${l.student.lastName}`,
          session: j.session,
          routeName: j.route.name,
          status: j.status,
          delayMinutes: j.delayMinutes,
          childStatus: mine?.status ?? null,
          stopsRemaining: prog.stopsRemaining,
          nextStop: prog.nextStopName,
          eta: eta ? eta.toISOString() : null,
          lastUpdate: j.positions[0]?.at ?? j.startedAt ?? null,
          // Approximate location only (privacy): never expose precise coords of other stops.
          approxLocation: j.status === "completed" ? "Journey ended" : j.status === "scheduled" ? "Not started" : `En route · ${prog.stopsRemaining} stop(s) remaining`,
        });
      }
    }
    return ok({ date, items });
  } catch (err) { return handleError(err); }
}
