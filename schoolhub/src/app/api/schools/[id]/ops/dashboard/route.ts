import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { opsDashboard } from "@/lib/reports";
import { handleError, ok } from "@/lib/http";

// Live operations dashboard tiles.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const data = await opsDashboard(params.id);
    return ok(data);
  } catch (err) { return handleError(err); }
}
