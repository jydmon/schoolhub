import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { documentCreateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
const toDate = (v?: string | null) => (v ? new Date(v) : null);

// List documents (filter by category/status/q).
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const sp = new URL(req.url).searchParams;
    const category = sp.get("category") || undefined;
    const status = sp.get("status") || undefined;
    const q = sp.get("q")?.trim();
    const documents = await prisma.document.findMany({
      where: {
        schoolId: params.id,
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { bodyText: { contains: q } }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    return ok({ documents });
  } catch (err) {
    return handleError(err);
  }
}

// Create a document.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const input = documentCreateSchema.parse(await req.json());

    const doc = await prisma.document.create({
      data: {
        schoolId: params.id,
        title: input.title,
        description: input.description || null,
        category: input.category || "faq",
        sourceType: input.sourceType || "text",
        ownerUserId: ctx.userId,
        createdById: ctx.userId,
        audienceRoles: (input.audienceRoles && input.audienceRoles.length ? input.audienceRoles : ["parent", "staff"]).join(","),
        campusId: input.campusId || null,
        yearGroup: input.yearGroup || null,
        classId: input.classId || null,
        effectiveDate: toDate(input.effectiveDate),
        reviewDate: toDate(input.reviewDate),
        expiryDate: toDate(input.expiryDate),
        fileName: input.fileName || null,
        linkUrl: input.linkUrl || null,
        bodyText: input.bodyText || "",
        status: input.status || "draft",
      },
    });
    await recordAudit({ action: AUDIT.DOCUMENT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Document", targetId: doc.id, metadata: { op: "create", category: doc.category } });
    return ok({ document: doc }, 201);
  } catch (err) {
    return handleError(err);
  }
}
