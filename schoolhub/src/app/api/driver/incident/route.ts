import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { loadDriverJourney } from "@/lib/driver";
import { incidentSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT, ROLES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// The incidents this driver has reported (their incident log).
export async function GET() {
  try {
    const ctx = await requireAuth();
    const incidents = await prisma.incident.findMany({
      where: { reportedByUserId: ctx.userId },
      orderBy: { at: "desc" }, take: 100,
      select: { id: true, type: true, notes: true, severity: true, status: true, journeyId: true, resolutionNote: true, resolvedAt: true, at: true },
    });
    return ok({ incidents });
  } catch (err) { return handleError(err); }
}

// Report a transport incident from the driver app. A journey may be attached; a
// general incident (no journey) is filed against the driver's school.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = incidentSchema.parse(await req.json());

    let schoolId: string | null = null;
    let journeyId: string | null = null;
    if (input.journeyId) {
      const journey = await loadDriverJourney(ctx, input.journeyId);
      if (!journey) return ok({ error: "Not found" }, 404);
      schoolId = journey.schoolId; journeyId = journey.id;
    } else {
      const membership = await prisma.membership.findFirst({ where: { userId: ctx.userId, role: ROLES.DRIVER } });
      schoolId = membership?.schoolId ?? null;
      if (!schoolId) return ok({ error: "No driver school found" }, 400);
    }

    const incident = await prisma.incident.create({
      data: { schoolId, journeyId, reportedByUserId: ctx.userId, type: input.type, notes: input.notes || null, severity: input.severity || "low" },
    });
    await recordAudit({ action: AUDIT.INCIDENT_REPORTED, schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Incident", targetId: incident.id, metadata: { type: input.type, severity: input.severity || "low" } });
    return ok({ incident }, 201);
  } catch (err) { return handleError(err); }
}
