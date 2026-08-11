import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { updateSubscriptionSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, clientIp, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    const subscription = await prisma.subscription.findUnique({
      where: { schoolId: params.id },
      include: { plan: true },
    });
    return ok({ subscription });
  } catch (err) {
    return handleError(err);
  }
}

// Update the subscription. Plan changes and status require MANAGE_SUBSCRIPTION;
// platform admins may also drive this from the platform portal.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    if (!ctx.isPlatformAdmin) assertCan(ctx, PERMISSIONS.MANAGE_SUBSCRIPTION, params.id);

    const input = updateSubscriptionSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (input.status) data.status = input.status;
    if (input.renewalDate) data.renewalDate = new Date(input.renewalDate);
    if (input.studentLimit !== undefined) data.studentLimit = input.studentLimit;
    if (input.vehicleLimit !== undefined) data.vehicleLimit = input.vehicleLimit;
    if (input.aiUsageLimit !== undefined) data.aiUsageLimit = input.aiUsageLimit;

    if (input.planKey) {
      const plan = await prisma.plan.findUnique({ where: { key: input.planKey } });
      if (!plan) return ok({ error: "Unknown plan" }, 400);
      data.planId = plan.id;
    }

    const subscription = await prisma.subscription.update({
      where: { schoolId: params.id },
      data,
      include: { plan: true },
    });

    await recordAudit({
      action: AUDIT.SUBSCRIPTION_CHANGED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "Subscription",
      targetId: subscription.id,
      ip: clientIp(req),
      metadata: { ...input },
    });

    return ok({ subscription });
  } catch (err) {
    return handleError(err);
  }
}
