import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { requestDecisionSchema } from "@/lib/validation";
import { notify } from "@/lib/transport";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; reqId: string } };

// Approve or reject a late transport change request.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const existing = await prisma.transportRequest.findFirst({ where: { id: params.reqId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    const { status } = requestDecisionSchema.parse(await req.json());
    const request = await prisma.transportRequest.update({ where: { id: existing.id }, data: { status, decidedByUserId: ctx.userId, decidedAt: new Date() } });
    await notify([existing.guardianUserId], { kind: "transport_request", title: `Transport request ${status}`, body: `Your ${existing.type} request for ${existing.date} was ${status}.`, schoolId: params.id, studentId: existing.studentId });
    await recordAudit({ action: AUDIT.TRANSPORT_REQUEST, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "TransportRequest", targetId: existing.id, metadata: { status } });
    return ok({ request });
  } catch (err) { return handleError(err); }
}
