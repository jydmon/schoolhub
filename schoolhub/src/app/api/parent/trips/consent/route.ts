import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { tripConsentSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Parent gives/declines consent for a trip (only for their own child).
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const { tripId, studentId, decision } = tripConsentSchema.parse(await req.json());
    const link = await prisma.guardianLink.findFirst({ where: { parentUserId: ctx.userId, studentId } });
    if (!link) return ok({ error: "Not a guardian of this student" }, 403);
    const ts = await prisma.tripStudent.findFirst({ where: { tripId, studentId } });
    if (!ts) return ok({ error: "Child is not on this trip" }, 404);
    const updated = await prisma.tripStudent.update({ where: { id: ts.id }, data: { consent: decision } });
    await recordAudit({ action: AUDIT.CONSENT_RESPONDED, schoolId: link.schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Trip", targetId: tripId, metadata: { studentId, decision, kind: "trip" } });
    return ok({ tripStudent: updated });
  } catch (err) { return handleError(err); }
}
