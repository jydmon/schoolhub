import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { docStatusSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; docId: string } };

// Move a document through its lifecycle (draft → under_review → approved → published → superseded → archived).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const existing = await prisma.document.findFirst({ where: { id: params.docId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);

    const { status, archived } = docStatusSchema.parse(await req.json());
    const data: Record<string, unknown> = { status };
    if (archived !== undefined) data.archived = archived;
    if (status === "archived") data.archived = true;
    if (status === "published" && !existing.effectiveDate) data.effectiveDate = new Date();

    const document = await prisma.document.update({ where: { id: existing.id }, data });
    await recordAudit({ action: AUDIT.DOCUMENT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Document", targetId: document.id, metadata: { op: "status", from: existing.status, to: status } });
    return ok({ document });
  } catch (err) {
    return handleError(err);
  }
}
