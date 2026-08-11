import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { listLoginHistory } from "@/lib/user-admin";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; userId: string } };

// A user's recent login history (admin, tenant-scoped).
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    return ok({ events: await listLoginHistory(params.id, params.userId) });
  } catch (err) { return handleError(err); }
}
