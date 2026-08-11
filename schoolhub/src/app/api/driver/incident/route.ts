import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { loadDriverJourney } from "@/lib/driver";
import { incidentSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Report a transport incident from the driver app.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = incidentSchema.parse(await req.json());
    if (!input.journeyId) return ok({ error: "journeyId required" }, 400);
    const journey = await loadDriverJourney(ctx, input.journeyId);
    if (!journey) return ok({ error: "Not found" }, 404);
    const incident = await prisma.incident.create({ data: { schoolId: journey.schoolId, journeyId: journey.id, reportedByUserId: ctx.userId, type: input.type, notes: input.notes || null } });
    await recordAudit({ action: AUDIT.INCIDENT_REPORTED, schoolId: journey.schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Incident", targetId: incident.id, metadata: { type: input.type } });
    return ok({ incident }, 201);
  } catch (err) { return handleError(err); }
}
