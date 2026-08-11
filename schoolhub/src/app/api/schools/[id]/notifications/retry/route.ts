import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Retry failed/queued notification deliveries (e.g. after a channel outage or
// once quiet hours end). Simulated adapter marks them sent; a real worker would
// re-attempt the provider call with backoff.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const result = await prisma.notification.updateMany({
      where: { schoolId: params.id, status: { in: ["failed", "queued"] }, channel: { not: "inapp" } },
      data: { status: "sent" },
    });
    return ok({ retried: result.count });
  } catch (err) { return handleError(err); }
}
