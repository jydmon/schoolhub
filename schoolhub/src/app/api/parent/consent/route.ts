import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { consentSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// A parent responds to a consent/payment request on an event for their child.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = consentSchema.parse(await req.json());

    // The caller must be a guardian of that child.
    const link = await prisma.guardianLink.findFirst({ where: { parentUserId: ctx.userId, studentId: input.studentId } });
    if (!link) return ok({ error: "Not a guardian of this student" }, 403);

    const event = await prisma.calendarEvent.findFirst({ where: { id: input.eventId, schoolId: link.schoolId } });
    if (!event) return ok({ error: "Event not found" }, 404);

    const consent = await prisma.eventConsent.upsert({
      where: { eventId_studentId_guardianUserId: { eventId: input.eventId, studentId: input.studentId, guardianUserId: ctx.userId } },
      update: { decision: input.decision ?? "given", paymentAck: !!input.paymentAck, respondedAt: new Date() },
      create: { eventId: input.eventId, studentId: input.studentId, guardianUserId: ctx.userId, decision: input.decision ?? "given", paymentAck: !!input.paymentAck },
    });

    await recordAudit({
      action: AUDIT.CONSENT_RESPONDED, schoolId: link.schoolId, actorUserId: ctx.userId, actorEmail: ctx.email,
      targetType: "CalendarEvent", targetId: input.eventId, metadata: { studentId: input.studentId, decision: consent.decision },
    });
    return ok({ consent });
  } catch (err) {
    return handleError(err);
  }
}
