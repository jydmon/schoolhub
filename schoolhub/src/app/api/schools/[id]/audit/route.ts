import { requireAuth } from "@/lib/session";
import { assertTenantAccess, listTenantAudit } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Tenant-scoped audit trail.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_AUDIT, params.id);
    const entries = await listTenantAudit(params.id, 200);
    return ok({ entries });
  } catch (err) {
    return handleError(err);
  }
}
