import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { dataRequestSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_SCHOOL_CONFIG, params.id);
    const requests = await prisma.dataRequest.findMany({ where: { schoolId: params.id }, orderBy: { createdAt: "desc" } });
    return ok({ requests });
  } catch (err) { return handleError(err); }
}

// Log a data subject request (access/export or erasure).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_SCHOOL_CONFIG, params.id);
    const i = dataRequestSchema.parse(await req.json());
    const request = await prisma.dataRequest.create({ data: { schoolId: params.id, subjectType: i.subjectType, subjectId: i.subjectId, type: i.type, note: i.note || null, requestedById: ctx.userId } });
    await recordAudit({ action: AUDIT.DSR_CREATED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "DataRequest", targetId: request.id, metadata: { type: i.type, subjectType: i.subjectType } });
    return ok({ request }, 201);
  } catch (err) { return handleError(err); }
}
