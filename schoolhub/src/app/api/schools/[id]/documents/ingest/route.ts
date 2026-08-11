import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { ingestSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Ingest a newsletter or sent parent email as a searchable document. Ingested
// communications default to published so they become searchable immediately.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const input = ingestSchema.parse(await req.json());
    const sourceType = input.sourceType || input.category || "newsletter";

    const doc = await prisma.document.create({
      data: {
        schoolId: params.id,
        title: input.title,
        category: "newsletter",
        sourceType,
        ownerUserId: ctx.userId,
        createdById: ctx.userId,
        audienceRoles: (input.audienceRoles && input.audienceRoles.length ? input.audienceRoles : ["parent", "staff"]).join(","),
        bodyText: input.bodyText,
        effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : new Date(),
        status: "published",
      },
    });
    await recordAudit({ action: AUDIT.MAILBOX_INGEST, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Document", targetId: doc.id, metadata: { sourceType, mailboxId: input.mailboxId } });
    return ok({ document: doc }, 201);
  } catch (err) {
    return handleError(err);
  }
}
