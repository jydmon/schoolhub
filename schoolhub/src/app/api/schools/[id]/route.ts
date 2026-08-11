import { prisma } from "@/lib/db";
import { requireAuth, requirePlatformAdmin } from "@/lib/session";
import { getTenantSchool } from "@/lib/tenant";
import { setTenantStatusSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, clientIp, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Get one school (platform admin, or a member of that tenant).
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const school = await getTenantSchool(ctx, params.id);
    if (!school) return ok({ error: "Not found" }, 404);
    return ok({ school });
  } catch (err) {
    return handleError(err);
  }
}

// Change tenant status: suspend / reactivate / archive (platform admin only).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requirePlatformAdmin();
    const { status } = setTenantStatusSchema.parse(await req.json());
    const before = await prisma.school.findUnique({ where: { id: params.id } });
    if (!before) return ok({ error: "Not found" }, 404);

    const school = await prisma.school.update({
      where: { id: params.id },
      data: { status },
    });

    // Keep the subscription in step when suspending/reactivating.
    if (status === "suspended") {
      await prisma.subscription.updateMany({
        where: { schoolId: params.id },
        data: { status: "suspended" },
      });
    } else if (status === "active") {
      await prisma.subscription.updateMany({
        where: { schoolId: params.id },
        data: { status: "active" },
      });
    }

    await recordAudit({
      action: status === "suspended" ? AUDIT.TENANT_SUSPENDED : AUDIT.TENANT_REACTIVATED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "School",
      targetId: params.id,
      ip: clientIp(req),
      metadata: { from: before.status, to: status },
    });

    return ok({ school });
  } catch (err) {
    return handleError(err);
  }
}
