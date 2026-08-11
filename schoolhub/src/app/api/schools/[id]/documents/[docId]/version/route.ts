import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; docId: string } };

// Create a new draft version; the previous version is marked superseded.
export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const prev = await prisma.document.findFirst({ where: { id: params.docId, schoolId: params.id } });
    if (!prev) return ok({ error: "Not found" }, 404);

    const [next] = await prisma.$transaction([
      prisma.document.create({
        data: {
          schoolId: params.id, title: prev.title, description: prev.description, category: prev.category,
          sourceType: prev.sourceType, ownerUserId: ctx.userId, createdById: ctx.userId, audienceRoles: prev.audienceRoles,
          campusId: prev.campusId, yearGroup: prev.yearGroup, classId: prev.classId, reviewDate: prev.reviewDate,
          fileName: prev.fileName, linkUrl: prev.linkUrl, bodyText: prev.bodyText,
          version: prev.version + 1, status: "draft", supersedesId: prev.id,
        },
      }),
      prisma.document.update({ where: { id: prev.id }, data: { status: "superseded" } }),
    ]);

    await recordAudit({ action: AUDIT.DOCUMENT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Document", targetId: next.id, metadata: { op: "new_version", version: next.version, supersedes: prev.id } });
    return ok({ document: next }, 201);
  } catch (err) {
    return handleError(err);
  }
}
