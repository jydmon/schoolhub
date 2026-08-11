import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { loadDriverJourney } from "@/lib/driver";
import { notifyStudentGuardians } from "@/lib/transport";
import { boardingSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { journeyId: string } };

// Mark a student boarded / absent / not present / dropped off, and notify guardians.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const journey = await loadDriverJourney(ctx, params.journeyId);
    if (!journey) return ok({ error: "Not found" }, 404);
    const { studentId, status } = boardingSchema.parse(await req.json());

    await prisma.boardingRecord.upsert({
      where: { journeyId_studentId: { journeyId: journey.id, studentId } },
      update: { status, at: new Date() },
      create: { journeyId: journey.id, studentId, status },
    });

    const am = journey.session === "am";
    let kind = "boarded", title = "Your child has boarded";
    if (status === "boarded") { kind = am ? "boarded" : "boarded_return"; title = am ? "Your child has boarded the bus" : "Your child has boarded for the return journey"; }
    else if (status === "dropped_off") { kind = am ? "arrived_school" : "dropped_off"; title = am ? "Your child has arrived at school" : "Your child has been dropped off"; }
    else { kind = "absent"; title = "Your child was marked not present for the bus"; }

    await notifyStudentGuardians([studentId], { kind, title, schoolId: journey.schoolId, journeyId: journey.id });
    await recordAudit({ action: AUDIT.JOURNEY_EVENT, schoolId: journey.schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Journey", targetId: journey.id, metadata: { event: "board", studentId, status } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
