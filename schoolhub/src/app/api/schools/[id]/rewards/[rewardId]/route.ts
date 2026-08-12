import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; rewardId: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const reward = await prisma.rewardRecord.findFirst({
      where: { id: params.rewardId, schoolId: params.id },
      include: { student: { select: { firstName: true, lastName: true, reference: true, yearGroup: true } } },
    });
    if (!reward) return ok({ error: "Not found" }, 404);
    return ok({ reward });
  } catch (err) { return handleError(err); }
}

// Delete a behaviour/reward record. Records that arrived from an integration
// (source of truth) are read-only here — manage them in the source system.
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const existing = await prisma.rewardRecord.findFirst({ where: { id: params.rewardId, schoolId: params.id } });
    if (!existing) return ok({ error: "Not found" }, 404);
    if (existing.integrationId) return ok({ error: "This record is fed by an integration and is read-only here. Manage it in the source behaviour system." }, 409);
    await prisma.rewardRecord.delete({ where: { id: existing.id } });
    await recordAudit({ action: AUDIT.REWARD_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "RewardRecord", targetId: existing.id, metadata: { op: "delete", type: existing.type } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
