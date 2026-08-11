import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Apply the school's data-retention policy: purge audit logs, notifications and
// AI queries older than the retention window, and vehicle positions older than
// 7 days (location minimisation). Run this on a schedule in production.
export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_SCHOOL_CONFIG, params.id);
    const config = await prisma.schoolConfig.findUnique({ where: { schoolId: params.id } });
    const days = config?.dataRetentionDays ?? 365;
    const cutoff = new Date(Date.now() - days * 864e5);
    const posCutoff = new Date(Date.now() - 7 * 864e5);

    const [audit, notifs, ai, positions] = await Promise.all([
      prisma.auditLog.deleteMany({ where: { schoolId: params.id, createdAt: { lt: cutoff } } }),
      prisma.notification.deleteMany({ where: { schoolId: params.id, createdAt: { lt: cutoff } } }),
      prisma.aiQuery.deleteMany({ where: { schoolId: params.id, createdAt: { lt: cutoff } } }),
      prisma.vehiclePosition.deleteMany({ where: { at: { lt: posCutoff }, journey: { schoolId: params.id } } }),
    ]);
    await recordAudit({ action: AUDIT.RETENTION_PURGE, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, metadata: { days, audit: audit.count, notifs: notifs.count, ai: ai.count, positions: positions.count } });
    return ok({ purged: { auditLogs: audit.count, notifications: notifs.count, aiQueries: ai.count, vehiclePositions: positions.count }, retentionDays: days });
  } catch (err) { return handleError(err); }
}
