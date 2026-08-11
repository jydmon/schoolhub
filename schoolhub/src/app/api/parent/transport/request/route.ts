import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { transportRequestSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Parent submits a transport change (cancel / absence / temp address / collector / note).
// Changes after the route cut-off time require staff approval.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = transportRequestSchema.parse(await req.json());

    const link = await prisma.guardianLink.findFirst({ where: { parentUserId: ctx.userId, studentId: input.studentId }, include: { student: { include: { transportProfile: true } } } });
    if (!link) return ok({ error: "Not a guardian of this student" }, 403);

    // Late-change detection against the route cut-off.
    let requiresApproval = false;
    const routeId = link.student.transportProfile?.routeId;
    if (routeId) {
      const route = await prisma.route.findUnique({ where: { id: routeId } });
      if (route && input.date === new Date().toISOString().slice(0, 10)) {
        const [h, m] = (route.cutoffTime || "07:00").split(":").map(Number);
        const cutoff = new Date(); cutoff.setHours(h, m, 0, 0);
        if (new Date() > cutoff) requiresApproval = true;
      }
    }

    const request = await prisma.transportRequest.create({
      data: {
        schoolId: link.schoolId, studentId: input.studentId, guardianUserId: ctx.userId,
        date: input.date, session: input.session || "day", type: input.type,
        payload: JSON.stringify(input.payload ?? {}),
        requiresApproval, status: requiresApproval ? "pending" : "auto",
      },
    });
    await recordAudit({ action: AUDIT.TRANSPORT_REQUEST, schoolId: link.schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "TransportRequest", targetId: request.id, metadata: { type: input.type, requiresApproval } });
    return ok({ request, requiresApproval }, 201);
  } catch (err) { return handleError(err); }
}
