import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { transportEnquiryUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; enqId: string } };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const existing = await prisma.transportEnquiry.findFirst({ where: { id: params.enqId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    const i = transportEnquiryUpdateSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (i.status !== undefined) data.status = i.status;
    if (i.responseNote !== undefined) data.responseNote = i.responseNote || null;
    const enquiry = await prisma.transportEnquiry.update({ where: { id: existing.id }, data });
    await recordAudit({ action: AUDIT.TRANSPORT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "TransportEnquiry", targetId: existing.id, metadata: { op: "update", fields: Object.keys(data) } });
    return ok({ enquiry });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const existing = await prisma.transportEnquiry.findFirst({ where: { id: params.enqId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    await prisma.transportEnquiry.delete({ where: { id: existing.id } });
    await recordAudit({ action: AUDIT.TRANSPORT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "TransportEnquiry", targetId: existing.id, metadata: { op: "delete" } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
