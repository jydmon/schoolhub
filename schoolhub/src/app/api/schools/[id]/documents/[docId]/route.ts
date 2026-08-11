import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { documentUpdateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; docId: string } };
const toDate = (v?: string | null) => (v ? new Date(v) : null);

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const document = await prisma.document.findFirst({ where: { id: params.docId, schoolId: params.id } });
    if (!document) return ok({ error: "Not found" }, 404);
    return ok({ document });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const existing = await prisma.document.findFirst({ where: { id: params.docId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);

    const input = documentUpdateSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    for (const k of ["title", "description", "category", "sourceType", "campusId", "yearGroup", "classId", "fileName", "linkUrl", "bodyText", "status"] as const) {
      if (input[k] !== undefined) data[k] = input[k] || (k === "bodyText" ? "" : null);
    }
    if (input.audienceRoles !== undefined) data.audienceRoles = input.audienceRoles.join(",");
    if (input.effectiveDate !== undefined) data.effectiveDate = toDate(input.effectiveDate);
    if (input.reviewDate !== undefined) data.reviewDate = toDate(input.reviewDate);
    if (input.expiryDate !== undefined) data.expiryDate = toDate(input.expiryDate);

    const document = await prisma.document.update({ where: { id: existing.id }, data });
    await recordAudit({ action: AUDIT.DOCUMENT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Document", targetId: document.id, metadata: { op: "update", fields: Object.keys(data) } });
    return ok({ document });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const existing = await prisma.document.findFirst({ where: { id: params.docId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    await prisma.document.delete({ where: { id: existing.id } });
    await recordAudit({ action: AUDIT.DOCUMENT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Document", targetId: existing.id, metadata: { op: "delete" } });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
