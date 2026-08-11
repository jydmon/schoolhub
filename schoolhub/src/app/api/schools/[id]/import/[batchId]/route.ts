import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; batchId: string } };

// Import batch detail including the full error report.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const batch = await prisma.importBatch.findFirst({
      where: { id: params.batchId, schoolId: params.id },
      include: { createdBy: { select: { email: true } } },
    });
    if (!batch) return ok({ error: "Not found" }, 404);

    return ok({
      batch: {
        ...batch,
        errorReport: JSON.parse(batch.errorReport || "[]"),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
