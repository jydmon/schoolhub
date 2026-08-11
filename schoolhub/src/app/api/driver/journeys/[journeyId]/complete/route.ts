import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { loadDriverJourney, rosterForJourney } from "@/lib/driver";
import { notifyStudentGuardians } from "@/lib/transport";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { journeyId: string } };

// Complete the journey → notify guardians and stop location sharing.
export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const journey = await loadDriverJourney(ctx, params.journeyId);
    if (!journey) return ok({ error: "Not found" }, 404);
    await prisma.journey.update({ where: { id: journey.id }, data: { status: "completed", completedAt: new Date() } });
    const roster = await rosterForJourney(journey);
    await notifyStudentGuardians(roster.map((p) => p.student.id), { kind: "journey_complete", title: "Journey completed", schoolId: journey.schoolId, journeyId: journey.id });
    await recordAudit({ action: AUDIT.JOURNEY_EVENT, schoolId: journey.schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Journey", targetId: journey.id, metadata: { event: "complete" } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
