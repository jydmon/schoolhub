import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { loadDriverJourney, rosterForJourney } from "@/lib/driver";
import { handleError, ok } from "@/lib/http";

type Params = { params: { journeyId: string } };

// Driver journey detail: route + ordered stops + roster with photos + boarding status.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const journey = await loadDriverJourney(ctx, params.journeyId);
    if (!journey) return ok({ error: "Not found" }, 404);

    const route = await prisma.route.findUnique({ where: { id: journey.routeId }, include: { stops: { orderBy: { sequence: "asc" } } } });
    const roster = await rosterForJourney(journey);
    const boardings = await prisma.boardingRecord.findMany({ where: { journeyId: journey.id } });
    const byStudent = new Map(boardings.map((b) => [b.studentId, b.status]));

    return ok({
      journey: { id: journey.id, session: journey.session, status: journey.status, date: journey.date, delayMinutes: journey.delayMinutes },
      route: { name: route?.name, stops: route?.stops ?? [] },
      students: roster.map((p) => ({
        id: p.student.id,
        name: `${p.student.preferredName || p.student.firstName} ${p.student.lastName}`,
        reference: p.student.reference,
        photoUrl: p.student.photoUrl,
        medicalAlert: p.student.medicalAlert,
        accessibility: p.accessibility,
        stopName: null,
        status: byStudent.get(p.student.id) || null,
      })),
    });
  } catch (err) { return handleError(err); }
}
