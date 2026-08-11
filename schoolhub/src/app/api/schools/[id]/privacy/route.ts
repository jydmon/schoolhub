import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { privacySchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_SCHOOL_CONFIG, params.id);
    const config = await prisma.schoolConfig.findUnique({ where: { schoolId: params.id } });
    return ok({ privacy: config ? { complianceRegime: config.complianceRegime, restrictMedical: config.restrictMedical, restrictSend: config.restrictSend, restrictLocation: config.restrictLocation, childLocationPrivacy: config.childLocationPrivacy, dataRetentionDays: config.dataRetentionDays } : null });
  } catch (err) { return handleError(err); }
}

// Update compliance regime, safeguarding restrictions and retention.
export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_SCHOOL_CONFIG, params.id);
    const i = privacySchema.parse(await req.json());
    await prisma.schoolConfig.upsert({ where: { schoolId: params.id }, update: i, create: { schoolId: params.id, ...i } });
    await recordAudit({ action: AUDIT.PRIVACY_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, metadata: { ...i } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
