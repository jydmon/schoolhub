import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { runSync } from "@/lib/sync";
import { runSyncSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; intId: string } };

// Trigger a synchronisation (also used to retry a failed one).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATIONS, params.id);

    const integration = await prisma.integration.findFirst({
      where: { id: params.intId, schoolId: params.id },
    });
    if (!integration) return ok({ error: "Not found" }, 404);

    const body = await req.json().catch(() => ({}));
    const { csvText, importType } = runSyncSchema.parse(body ?? {});

    const outcome = await runSync(integration.id, {
      trigger: csvText ? "csv" : "manual",
      csvText,
      importType,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
    });

    return ok(outcome);
  } catch (err) {
    return handleError(err);
  }
}
