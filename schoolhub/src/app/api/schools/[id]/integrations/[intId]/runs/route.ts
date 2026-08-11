import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; intId: string } };

// Sync history + logs for an integration.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATIONS, params.id);

    const runs = await prisma.syncRun.findMany({
      where: { integrationId: params.intId, schoolId: params.id },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    return ok({
      runs: runs.map((r) => ({
        id: r.id,
        trigger: r.trigger,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        recordsIn: r.recordsIn,
        recordsUpdated: r.recordsUpdated,
        recordsFailed: r.recordsFailed,
        message: r.message,
        log: safeArr(r.log),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

function safeArr(s: string) {
  try { return JSON.parse(s || "[]"); } catch { return []; }
}
