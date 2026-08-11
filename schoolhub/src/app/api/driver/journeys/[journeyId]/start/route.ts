import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { loadDriverJourney, rosterForJourney } from "@/lib/driver";
import { notifyStudentGuardians } from "@/lib/transport";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { journeyId: string } };

// Start the journey → notify guardians the bus has started its route.
export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const journey = await loadDriverJourney(ctx, params.journeyId);
    if (!journey) return ok({ error: "Not found" }, 404);

    await prisma.journey.update({ where: { id: journey.id }, data: { status: "started", startedAt: new Date() } });
    const roster = await rosterForJourney(journey);
    const studentIds = roster.map((p) => p.student.id);
    await notifyStudentGuardians(studentIds, { kind: "route_started", title: journey.session === "am" ? "Bus has started the morning route" : "Bus has started the return route", schoolId: journey.schoolId, journeyId: journey.id });
    await recordAudit({ action: AUDIT.JOURNEY_EVENT, schoolId: journey.schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Journey", targetId: journey.id, metadata: { event: "start" } });
    return ok({ ok: true, notified: studentIds.length });
  } catch (err) { return handleError(err); }
}
